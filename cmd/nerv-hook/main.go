// nerv-hook is the NERV permission hook binary for Claude Code
// It handles PreToolUse, PostToolUse, and Stop events from Claude Code hooks
package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// HookInput represents the JSON input from Claude Code hooks
type HookInput struct {
	SessionID    string                 `json:"session_id"`
	ToolName     string                 `json:"tool_name"`
	ToolInput    map[string]interface{} `json:"tool_input"`
	StopReason   string                 `json:"stop_reason,omitempty"`
	StopGenIndex int                    `json:"stop_gen_index,omitempty"`
}

// HookOutput represents the JSON output to Claude Code hooks
type HookOutput struct {
	Decision *Decision `json:"decision,omitempty"`
}

// Decision represents a permission decision
type Decision struct {
	Behavior string `json:"behavior"` // "allow", "deny", or "block"
	Message  string `json:"message,omitempty"`
}

// PermissionRule represents a permission allow/deny rule
type PermissionRule struct {
	Pattern string
	Regex   *regexp.Regexp
}

// Global config paths
var (
	nervDir    string
	configPath string
	dbPath     string
)

func init() {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = "."
	}
	nervDir = filepath.Join(homeDir, ".nerv")
	configPath = filepath.Join(nervDir, "permissions.json")
	dbPath = filepath.Join(nervDir, "state.db")
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "Usage: nerv-hook <command>")
		fmt.Fprintln(os.Stderr, "Commands: pre-tool-use, post-tool-use, stop")
		os.Exit(1)
	}

	command := os.Args[1]

	// Read JSON input from stdin
	inputData, err := io.ReadAll(os.Stdin)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to read stdin: %v\n", err)
		os.Exit(1)
	}

	var input HookInput
	if len(inputData) > 0 {
		if err := json.Unmarshal(inputData, &input); err != nil {
			fmt.Fprintf(os.Stderr, "Failed to parse input JSON: %v\n", err)
			os.Exit(1)
		}
	}

	// Get environment variables
	projectID := os.Getenv("NERV_PROJECT_ID")
	taskID := os.Getenv("NERV_TASK_ID")

	// Open database
	db, err := openDatabase()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to open database: %v\n", err)
		// Continue without database - just log to stderr
	}
	defer func() {
		if db != nil {
			db.Close()
		}
	}()

	var output HookOutput

	switch command {
	case "pre-tool-use":
		output = handlePreToolUse(db, projectID, taskID, input)
	case "post-tool-use":
		handlePostToolUse(db, projectID, taskID, input)
		output = HookOutput{} // Empty response
	case "stop":
		handleStop(db, projectID, taskID, input)
		output = HookOutput{} // Empty response
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", command)
		os.Exit(1)
	}

	// Write JSON output to stdout
	outputData, _ := json.Marshal(output)
	fmt.Println(string(outputData))
}

// openDatabase opens the NERV SQLite database
func openDatabase() (*sql.DB, error) {
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("database not found: %s", dbPath)
	}

	db, err := sql.Open("sqlite", dbPath+"?mode=rw")
	if err != nil {
		return nil, err
	}

	// Enable WAL mode and foreign keys
	db.Exec("PRAGMA journal_mode = WAL")
	db.Exec("PRAGMA foreign_keys = ON")

	return db, nil
}

// handlePreToolUse handles PreToolUse hook events
// Returns a decision to allow, deny, or block the tool use
func handlePreToolUse(db *sql.DB, projectID, taskID string, input HookInput) HookOutput {
	toolName := input.ToolName
	toolInputJSON, _ := json.Marshal(input.ToolInput)
	toolInputStr := string(toolInputJSON)

	// Check if this tool needs approval based on permissions
	needsApproval, denyReason := checkPermission(toolName, toolInputStr)

	if denyReason != "" {
		// Explicitly denied by rule
		logAudit(db, taskID, "tool_denied", fmt.Sprintf(`{"tool":"%s","reason":"%s"}`, toolName, denyReason))
		return HookOutput{
			Decision: &Decision{
				Behavior: "deny",
				Message:  denyReason,
			},
		}
	}

	if needsApproval {
		// Queue approval request and wait for decision
		approvalID := queueApproval(db, taskID, toolName, toolInputStr, "")
		if approvalID <= 0 {
			// Failed to queue, just allow (fail open for now)
			logAudit(db, taskID, "approval_queue_failed", fmt.Sprintf(`{"tool":"%s"}`, toolName))
			return HookOutput{}
		}

		logAudit(db, taskID, "approval_requested", fmt.Sprintf(`{"approval_id":%d,"tool":"%s"}`, approvalID, toolName))

		// Poll for decision (wait up to 10 minutes, user can take their time)
		decision, denyReason := pollForDecision(db, approvalID, 10*time.Minute)

		switch decision {
		case "approved":
			logAudit(db, taskID, "approval_granted", fmt.Sprintf(`{"approval_id":%d}`, approvalID))
			return HookOutput{
				Decision: &Decision{
					Behavior: "allow",
				},
			}
		case "denied":
			logAudit(db, taskID, "approval_denied", fmt.Sprintf(`{"approval_id":%d,"reason":"%s"}`, approvalID, denyReason))
			return HookOutput{
				Decision: &Decision{
					Behavior: "deny",
					Message:  denyReason,
				},
			}
		default:
			// Timeout or error - deny by default
			logAudit(db, taskID, "approval_timeout", fmt.Sprintf(`{"approval_id":%d}`, approvalID))
			return HookOutput{
				Decision: &Decision{
					Behavior: "deny",
					Message:  "Approval request timed out",
				},
			}
		}
	}

	// Auto-approved (safe tool or matches allow rule)
	return HookOutput{}
}

// handlePostToolUse handles PostToolUse hook events
// Used for logging and formatters
func handlePostToolUse(db *sql.DB, projectID, taskID string, input HookInput) {
	toolName := input.ToolName
	toolInputJSON, _ := json.Marshal(input.ToolInput)

	logAudit(db, taskID, "tool_completed", fmt.Sprintf(`{"tool":"%s","input":%s}`, toolName, string(toolInputJSON)))
}

// handleStop handles Stop hook events
// Updates task status when Claude session ends
func handleStop(db *sql.DB, projectID, taskID string, input HookInput) {
	logAudit(db, taskID, "session_stop", fmt.Sprintf(`{"reason":"%s"}`, input.StopReason))

	if db == nil || taskID == "" {
		return
	}

	// Update task status to 'review' when Claude stops
	_, err := db.Exec(
		"UPDATE tasks SET status = 'review' WHERE id = ? AND status = 'in_progress'",
		taskID,
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to update task status: %v\n", err)
	}
}

// checkPermission checks if a tool use needs approval or should be denied
// Returns (needsApproval, denyReason)
func checkPermission(toolName, toolInput string) (bool, string) {
	// Load permission rules
	permissions := loadPermissions()

	// Build the tool signature for matching
	toolSignature := buildToolSignature(toolName, toolInput)

	// Check deny rules first
	for _, rule := range permissions.Deny {
		if matchesRule(rule, toolSignature) {
			return false, fmt.Sprintf("Blocked by rule: %s", rule)
		}
	}

	// Check allow rules
	for _, rule := range permissions.Allow {
		if matchesRule(rule, toolSignature) {
			return false, "" // Allowed, no approval needed
		}
	}

	// Default: needs approval for potentially dangerous tools
	dangerousTools := map[string]bool{
		"Bash":        true,
		"Write":       true,
		"Edit":        true,
		"NotebookEdit": true,
	}

	if dangerousTools[toolName] {
		return true, ""
	}

	// Safe tools (Read, Grep, Glob, etc.) - auto-allow
	return false, ""
}

// Permissions represents the permission configuration
type Permissions struct {
	Allow []string `json:"allow"`
	Deny  []string `json:"deny"`
}

// loadPermissions loads permission rules from config file
func loadPermissions() Permissions {
	defaultPerms := Permissions{
		Allow: []string{
			"Read",
			"Grep",
			"Glob",
			"LS",
			"Bash(npm test:*)",
			"Bash(npm run:*)",
			"Bash(git log:*)",
			"Bash(git diff:*)",
			"Bash(git status)",
		},
		Deny: []string{
			// Critical system protection (PRD Section 7)
			"Bash(rm -rf /)",
			"Bash(rm -rf /*)",
			"Bash(sudo:*)",
			"Read(~/.ssh/*)",
			// Git safety - require explicit approval (PRD Section 25)
			"Bash(git push:*)",
			"Bash(git checkout:*)",
			"Bash(git reset:*)",
			"Bash(git rebase:*)",
			// NERV state protection (PRD Section 22)
			"Read(~/.nerv/*)",
			"Write(~/.nerv/*)",
			"Edit(~/.nerv/*)",
			"Bash(nerv-hook:*)",
			"Bash(*~/.nerv*)",
		},
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return defaultPerms
	}

	var perms Permissions
	if err := json.Unmarshal(data, &perms); err != nil {
		return defaultPerms
	}

	return perms
}

// buildToolSignature builds a string signature for matching against rules
func buildToolSignature(toolName, toolInput string) string {
	// For Bash commands, extract the command
	if toolName == "Bash" {
		var input map[string]interface{}
		if err := json.Unmarshal([]byte(toolInput), &input); err == nil {
			if cmd, ok := input["command"].(string); ok {
				return fmt.Sprintf("Bash(%s)", cmd)
			}
		}
	}

	// For file operations, extract the path
	if toolName == "Read" || toolName == "Write" || toolName == "Edit" {
		var input map[string]interface{}
		if err := json.Unmarshal([]byte(toolInput), &input); err == nil {
			if path, ok := input["file_path"].(string); ok {
				return fmt.Sprintf("%s(%s)", toolName, path)
			}
		}
	}

	return toolName
}

// matchesRule checks if a tool signature matches a permission rule
func matchesRule(rule, signature string) bool {
	// Convert rule pattern to regex
	// * matches any characters
	// : is a separator for command prefixes
	pattern := regexp.QuoteMeta(rule)
	pattern = strings.ReplaceAll(pattern, `\*`, ".*")
	pattern = strings.ReplaceAll(pattern, `\:`, ":")
	pattern = "^" + pattern + "$"

	re, err := regexp.Compile(pattern)
	if err != nil {
		return false
	}

	return re.MatchString(signature)
}

// queueApproval inserts an approval request into the database
func queueApproval(db *sql.DB, taskID, toolName, toolInput, context string) int64 {
	if db == nil {
		return 0
	}

	result, err := db.Exec(
		"INSERT INTO approvals (task_id, tool_name, tool_input, context, status) VALUES (?, ?, ?, ?, 'pending')",
		taskID, toolName, toolInput, context,
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to insert approval: %v\n", err)
		return 0
	}

	id, err := result.LastInsertId()
	if err != nil {
		return 0
	}

	return id
}

// pollForDecision waits for an approval decision from the dashboard
func pollForDecision(db *sql.DB, approvalID int64, timeout time.Duration) (string, string) {
	if db == nil {
		return "denied", "Database not available"
	}

	deadline := time.Now().Add(timeout)
	pollInterval := 200 * time.Millisecond

	for time.Now().Before(deadline) {
		var status, denyReason string
		var decidedAt sql.NullString

		err := db.QueryRow(
			"SELECT status, deny_reason, decided_at FROM approvals WHERE id = ?",
			approvalID,
		).Scan(&status, &denyReason, &decidedAt)

		if err != nil {
			time.Sleep(pollInterval)
			continue
		}

		if status != "pending" && decidedAt.Valid {
			return status, denyReason
		}

		time.Sleep(pollInterval)
	}

	return "timeout", "Approval request timed out"
}

// logAudit logs an event to the audit log
func logAudit(db *sql.DB, taskID, eventType, details string) {
	if db == nil {
		return
	}

	_, err := db.Exec(
		"INSERT INTO audit_log (task_id, event_type, details) VALUES (?, ?, ?)",
		taskID, eventType, details,
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to log audit event: %v\n", err)
	}
}
