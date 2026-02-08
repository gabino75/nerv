/**
 * Database migrations for NERV
 * Each migration has a version number, name, and SQL to execute
 */

export interface Migration {
  version: number
  name: string
  up: string
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: `
      -- Schema version tracking
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Core entities
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        goal TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS repos (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        stack TEXT
      );

      CREATE TABLE IF NOT EXISTS documentation_sources (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        url_pattern TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cycles (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        cycle_number INTEGER NOT NULL,
        goal TEXT,
        status TEXT DEFAULT 'active',
        learnings TEXT,
        completed_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        cycle_id TEXT REFERENCES cycles(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        task_type TEXT DEFAULT 'implementation',
        status TEXT DEFAULT 'todo',
        repos TEXT,
        worktree_path TEXT,
        session_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        parent_session_id TEXT,
        parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
        status TEXT DEFAULT 'active',
        summary TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        cycle_id TEXT REFERENCES cycles(id),
        title TEXT NOT NULL,
        rationale TEXT,
        alternatives TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS approvals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
        tool_name TEXT NOT NULL,
        tool_input TEXT,
        context TEXT,
        status TEXT DEFAULT 'pending',
        deny_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        decided_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS session_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
        session_id TEXT,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        compaction_count INTEGER DEFAULT 0,
        model TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        task_id TEXT,
        event_type TEXT NOT NULL,
        details TEXT
      );

      -- Create indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_approvals_task ON approvals(task_id);
      CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
      CREATE INDEX IF NOT EXISTS idx_cycles_project ON cycles(project_id);
    `
  },
  {
    version: 2,
    name: 'add_cost_tracking',
    up: `
      -- Add cost tracking to session metrics
      ALTER TABLE session_metrics ADD COLUMN cost_usd REAL DEFAULT 0;
      ALTER TABLE session_metrics ADD COLUMN duration_ms INTEGER DEFAULT 0;
      ALTER TABLE session_metrics ADD COLUMN num_turns INTEGER DEFAULT 0;
    `
  },
  {
    version: 3,
    name: 'add_yolo_benchmark',
    up: `
      -- YOLO Benchmark configuration table
      CREATE TABLE IF NOT EXISTS yolo_benchmark_configs (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        model TEXT NOT NULL,
        max_cycles INTEGER NOT NULL DEFAULT 10,
        max_cost_usd REAL NOT NULL DEFAULT 5.0,
        max_duration_ms INTEGER NOT NULL DEFAULT 1800000,
        auto_approve_review INTEGER NOT NULL DEFAULT 1,
        auto_approve_dangerous_tools INTEGER NOT NULL DEFAULT 0,
        test_command TEXT,
        spec_file TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- YOLO Benchmark results table
      CREATE TABLE IF NOT EXISTS yolo_benchmark_results (
        id TEXT PRIMARY KEY,
        config_id TEXT REFERENCES yolo_benchmark_configs(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'idle',
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        cycles_completed INTEGER DEFAULT 0,
        tasks_completed INTEGER DEFAULT 0,
        total_cost_usd REAL DEFAULT 0,
        total_duration_ms INTEGER DEFAULT 0,
        tests_passed INTEGER DEFAULT 0,
        tests_failed INTEGER DEFAULT 0,
        spec_completion_pct REAL DEFAULT 0,
        stop_reason TEXT
      );

      -- Create indexes for benchmark queries
      CREATE INDEX IF NOT EXISTS idx_yolo_configs_project ON yolo_benchmark_configs(project_id);
      CREATE INDEX IF NOT EXISTS idx_yolo_results_config ON yolo_benchmark_results(config_id);
      CREATE INDEX IF NOT EXISTS idx_yolo_results_status ON yolo_benchmark_results(status);
    `
  },
  {
    version: 4,
    name: 'add_subagent_tracking',
    up: `
      -- Subagent tracking table for Claude Code Task tool spawned agents
      CREATE TABLE IF NOT EXISTS subagents (
        id TEXT PRIMARY KEY,
        parent_session_id TEXT NOT NULL,
        task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
        agent_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      );

      -- Create indexes for subagent queries
      CREATE INDEX IF NOT EXISTS idx_subagents_parent ON subagents(parent_session_id);
      CREATE INDEX IF NOT EXISTS idx_subagents_task ON subagents(task_id);
      CREATE INDEX IF NOT EXISTS idx_subagents_status ON subagents(status);
    `
  },
  {
    version: 5,
    name: 'add_project_custom_agents',
    up: `
      -- Add custom_agents column to projects for storing custom agent definitions
      -- Stored as JSON string: { "agent-name": { description, prompt, tools?, model? }, ... }
      ALTER TABLE projects ADD COLUMN custom_agents TEXT;
    `
  },
  {
    version: 6,
    name: 'add_repo_context_scanning',
    up: `
      -- Repository context scanning (PRD Section 24)
      -- Stores discovered CLAUDE.md, skills, MCP config, README, etc.
      CREATE TABLE IF NOT EXISTS repo_context (
        id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        context_type TEXT NOT NULL,  -- 'claude_md', 'skill', 'mcp_config', 'readme', etc.
        file_path TEXT NOT NULL,
        content TEXT NOT NULL,
        parsed_sections TEXT,  -- JSON
        last_scanned_at INTEGER,
        file_hash TEXT
      );

      -- Repository skills (Claude Code custom commands)
      CREATE TABLE IF NOT EXISTS repo_skills (
        id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        skill_name TEXT NOT NULL,
        skill_path TEXT NOT NULL,
        description TEXT,
        trigger_pattern TEXT,
        content TEXT NOT NULL,
        UNIQUE(repo_id, skill_name)
      );

      -- Indexes for repo context queries
      CREATE INDEX IF NOT EXISTS idx_repo_context_repo ON repo_context(repo_id);
      CREATE INDEX IF NOT EXISTS idx_repo_context_type ON repo_context(context_type);
      CREATE INDEX IF NOT EXISTS idx_repo_skills_repo ON repo_skills(repo_id);
    `
  },
  {
    version: 7,
    name: 'add_settings_table',
    up: `
      -- Settings table for storing CLI/app preferences
      -- Uses a key-value structure for flexibility
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create index for faster lookups
      CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
    `
  },
  {
    version: 8,
    name: 'add_task_reviews',
    up: `
      -- Task reviews table for review gate before merge (PRD Section 2)
      CREATE TABLE IF NOT EXISTS task_reviews (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        reviewer_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        decided_at TIMESTAMP
      );

      -- Create indexes for review queries
      CREATE INDEX IF NOT EXISTS idx_task_reviews_task ON task_reviews(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_reviews_status ON task_reviews(status);
    `
  },
  {
    version: 9,
    name: 'add_debug_findings',
    up: `
      -- Debug findings table for debug task suggested fixes (PRD Section 3)
      -- Stores structured findings from debug tasks without code changes
      CREATE TABLE IF NOT EXISTS debug_findings (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        finding_type TEXT NOT NULL,  -- 'root_cause', 'affected_component', 'suggested_fix', 'prevention'
        title TEXT NOT NULL,
        content TEXT NOT NULL,       -- Detailed finding description (markdown)
        code_snippet TEXT,           -- Optional diff or code example
        file_path TEXT,              -- Optional file path reference
        priority INTEGER DEFAULT 0,  -- Ordering within findings
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for findings queries
      CREATE INDEX IF NOT EXISTS idx_debug_findings_task ON debug_findings(task_id);
      CREATE INDEX IF NOT EXISTS idx_debug_findings_type ON debug_findings(finding_type);
    `
  },
  {
    version: 10,
    name: 'add_audit_results',
    up: `
      -- Audit results table for code and plan health checks (PRD Section 5)
      -- Stores audit results with issues and auto-refactor task creation
      CREATE TABLE IF NOT EXISTS audit_results (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        cycle_id TEXT REFERENCES cycles(id) ON DELETE SET NULL,
        audit_type TEXT NOT NULL,        -- 'code_health', 'plan_health', 'full'
        status TEXT NOT NULL,            -- 'passed', 'failed', 'warning'
        code_health TEXT,                -- JSON: CodeHealthCheck
        plan_health TEXT,                -- JSON: PlanHealthCheck
        issues TEXT NOT NULL,            -- JSON: AuditIssue[]
        failed_checks TEXT NOT NULL,     -- JSON: string[]
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for audit queries
      CREATE INDEX IF NOT EXISTS idx_audit_results_project ON audit_results(project_id);
      CREATE INDEX IF NOT EXISTS idx_audit_results_cycle ON audit_results(cycle_id);
      CREATE INDEX IF NOT EXISTS idx_audit_results_status ON audit_results(status);
    `
  },
  {
    version: 11,
    name: 'add_instance_management',
    up: `
      -- Instance tracking table for multi-instance support (PRD Section 11)
      -- Tracks running NERV instances for coordination
      CREATE TABLE IF NOT EXISTS nerv_instances (
        instance_id TEXT PRIMARY KEY,
        process_id INTEGER NOT NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Project locks table for exclusive project access
      CREATE TABLE IF NOT EXISTS project_locks (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        instance_id TEXT NOT NULL,
        process_id INTEGER NOT NULL,
        acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Resource tracking for system-wide limits
      CREATE TABLE IF NOT EXISTS resource_usage (
        resource_key TEXT PRIMARY KEY,
        current_count INTEGER NOT NULL DEFAULT 0,
        max_limit INTEGER NOT NULL,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Initialize resource limits
      INSERT OR IGNORE INTO resource_usage (resource_key, current_count, max_limit)
      VALUES ('claude_sessions', 0, 8);

      -- Create indexes for instance queries
      CREATE INDEX IF NOT EXISTS idx_instances_project ON nerv_instances(project_id);
      CREATE INDEX IF NOT EXISTS idx_instances_heartbeat ON nerv_instances(last_heartbeat);
    `
  },
  {
    version: 12,
    name: 'add_acceptance_criteria',
    up: `
      -- Acceptance criteria for task verification (PRD Section 16)
      -- Each task can have multiple criteria that must pass before completion
      CREATE TABLE IF NOT EXISTS acceptance_criteria (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        verifier TEXT NOT NULL,           -- 'command', 'file_exists', 'grep', 'test_pass', 'manual'

        -- For 'command' verifier
        command TEXT,
        expected_exit_code INTEGER DEFAULT 0,
        expected_output TEXT,             -- Regex or substring match

        -- For 'file_exists' verifier
        file_path TEXT,

        -- For 'grep' verifier
        grep_file TEXT,
        grep_pattern TEXT,
        should_match INTEGER DEFAULT 1,   -- 1 = must match, 0 = must NOT match

        -- For 'test_pass' verifier
        test_command TEXT,
        test_pattern TEXT,

        -- For 'manual' verifier
        checklist_item TEXT,

        -- Status tracking
        status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'pass', 'fail'
        last_check_output TEXT,
        last_check_time TIMESTAMP,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Task iterations tracking (each attempt Claude makes)
      CREATE TABLE IF NOT EXISTS task_iterations (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        iteration_number INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',  -- 'running', 'completed', 'failed'
        duration_ms INTEGER DEFAULT 0,
        files_changed TEXT,               -- JSON: IterationFileChange[]
        verification_result TEXT,         -- JSON: TaskVerificationResult
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      );

      -- Verification templates for reusable criteria patterns
      CREATE TABLE IF NOT EXISTS verification_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        criteria TEXT NOT NULL,           -- JSON: criteria definitions array
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for verification queries
      CREATE INDEX IF NOT EXISTS idx_criteria_task ON acceptance_criteria(task_id);
      CREATE INDEX IF NOT EXISTS idx_criteria_status ON acceptance_criteria(status);
      CREATE INDEX IF NOT EXISTS idx_iterations_task ON task_iterations(task_id);
      CREATE INDEX IF NOT EXISTS idx_iterations_status ON task_iterations(status);
    `
  },
  {
    version: 13,
    name: 'add_project_constraints',
    up: `
      -- Add constraints column to projects for project-level constraints (PRD Section 17)
      -- Stored as JSON array: ["constraint 1", "constraint 2", ...]
      ALTER TABLE projects ADD COLUMN constraints TEXT;
    `
  },
  {
    version: 14,
    name: 'add_learnings_table',
    up: `
      -- Learnings table for project-wide knowledge (PRD Section 11: nerv learn)
      -- Separate from cycle-level learnings for persistent knowledge
      CREATE TABLE IF NOT EXISTS learnings (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        category TEXT,  -- 'technical', 'process', 'domain', etc.
        source TEXT,    -- 'manual', 'cycle_completion', 'debug_task', etc.
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for learnings queries
      CREATE INDEX IF NOT EXISTS idx_learnings_project ON learnings(project_id);
      CREATE INDEX IF NOT EXISTS idx_learnings_category ON learnings(category);
    `
  },
  {
    version: 15,
    name: 'add_success_metrics',
    up: `
      -- Success metrics table for PRD Section 31
      -- Tracks key performance indicators: time to first task, command catches, recovery rate, etc.
      CREATE TABLE IF NOT EXISTS success_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        metric_type TEXT NOT NULL,     -- 'time_to_first_task', 'dangerous_command_catch', etc.
        target_value REAL NOT NULL,    -- Target threshold (e.g., 300000ms, 90%, etc.)
        current_value REAL NOT NULL DEFAULT 0,
        passed INTEGER NOT NULL DEFAULT 0,  -- 1 if meeting target, 0 otherwise
        sample_count INTEGER NOT NULL DEFAULT 0,  -- Number of data points
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, metric_type)
      );

      -- Add first_task_started_at column to projects for time tracking
      ALTER TABLE projects ADD COLUMN first_task_started_at TIMESTAMP;

      -- Add is_dangerous column to approvals for tracking dangerous command catches
      ALTER TABLE approvals ADD COLUMN is_dangerous INTEGER DEFAULT 0;

      -- Add was_recovered column to tasks for recovery tracking
      ALTER TABLE tasks ADD COLUMN was_interrupted INTEGER DEFAULT 0;
      ALTER TABLE tasks ADD COLUMN was_recovered INTEGER DEFAULT 0;

      -- Create indexes for success metrics queries
      CREATE INDEX IF NOT EXISTS idx_success_metrics_project ON success_metrics(project_id);
      CREATE INDEX IF NOT EXISTS idx_success_metrics_type ON success_metrics(metric_type);
    `
  },
  {
    version: 16,
    name: 'add_user_statements',
    up: `
      -- User statements table for spec drift detection (PRD Section 2)
      -- Tracks user statements and compares against spec to detect drift
      CREATE TABLE IF NOT EXISTS user_statements (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        timestamp INTEGER NOT NULL,           -- Unix timestamp (milliseconds)
        text TEXT NOT NULL,                   -- What user said
        source TEXT NOT NULL,                 -- 'chat', 'feedback', 'review'
        addressed INTEGER NOT NULL DEFAULT 0, -- 0 = not addressed, 1 = addressed in spec
        spec_reference TEXT,                  -- Link to spec item if addressed
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for user statements queries
      CREATE INDEX IF NOT EXISTS idx_user_statements_project ON user_statements(project_id);
      CREATE INDEX IF NOT EXISTS idx_user_statements_addressed ON user_statements(addressed);
      CREATE INDEX IF NOT EXISTS idx_user_statements_source ON user_statements(source);
    `
  },
  {
    version: 17,
    name: 'add_project_review_mode',
    up: `
      -- Add review_mode column to projects (PRD Review Modes section)
      -- 'normal' = Human reviews before merge (default)
      -- 'yolo' = AI reviews and auto-merges if tests pass
      ALTER TABLE projects ADD COLUMN review_mode TEXT NOT NULL DEFAULT 'normal';
    `
  },
  {
    version: 18,
    name: 'add_repo_source_and_branch_settings',
    up: `
      -- PRD Section 25: Repository Management
      -- Add source_type: 'local' (existing repo) or 'remote' (URL to clone)
      ALTER TABLE repos ADD COLUMN source_type TEXT NOT NULL DEFAULT 'local';
      -- Add base_branch: branch to base features from (e.g., 'main')
      ALTER TABLE repos ADD COLUMN base_branch TEXT DEFAULT 'main';
      -- Add fetch settings
      ALTER TABLE repos ADD COLUMN fetch_before_worktree INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE repos ADD COLUMN auto_fetch_on_open INTEGER NOT NULL DEFAULT 1;
    `
  },
  {
    version: 19,
    name: 'add_compactions_since_clear',
    up: `
      -- PRD Section 6: Context Awareness
      -- Track compactions since last /clear (separate from session total)
      ALTER TABLE session_metrics ADD COLUMN compactions_since_clear INTEGER DEFAULT 0;
    `
  },
  {
    version: 20,
    name: 'add_cache_token_tracking',
    up: `
      -- PRD Section 14: Cost Tracking
      -- Track cache read and creation tokens for accurate cost calculation
      ALTER TABLE session_metrics ADD COLUMN cache_read_tokens INTEGER DEFAULT 0;
      ALTER TABLE session_metrics ADD COLUMN cache_creation_tokens INTEGER DEFAULT 0;
    `
  },
  {
    version: 21,
    name: 'add_auto_cleanup_worktrees',
    up: `
      -- PRD Section 25: Configurable auto-cleanup of worktrees after task completion
      ALTER TABLE repos ADD COLUMN auto_cleanup_worktrees INTEGER NOT NULL DEFAULT 0;
    `
  }
]
