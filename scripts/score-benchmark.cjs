#!/usr/bin/env node
/**
 * NERV Benchmark Scoring Script
 *
 * Analyzes benchmark output and generates scores using Claude.
 * Run after a benchmark completes to get objective evaluation.
 *
 * Usage: node scripts/score-benchmark.js <benchmark-results-dir>
 *
 * Requires: ANTHROPIC_API_KEY environment variable OR Claude CLI auth
 *
 * PRD Section 26: Benchmark Scoring System
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');

// Scoring prompt for Claude
const SCORING_PROMPT = `You are evaluating a NERV benchmark run. NERV is a system that orchestrates Claude Code to implement features from a spec.

Your job is to analyze the benchmark output and assign objective scores. Be critical but fair. Look for specific evidence to support your scores.

## Scoring Categories

### 1. Implementation Quality (1-10)
Evaluate the resulting code:
- Code organization and structure
- Documentation quality
- Naming conventions and consistency
- Test coverage and quality
- Integration with existing code
- DRY violations and code smells
- Type safety and error handling
- Security considerations

### 2. Workflow Quality (1-10)
Evaluate how well the NERV workflow was followed:
- Worktree isolation (work in worktrees, not main?)
- Parallelization (independent tasks in parallel?)
- Audit cycles (ran? caught issues?)
- Review process (YOLO reviews worked?)
- Cycle planning (well-scoped? learnings recorded?)
- Permission handling (appropriate requests?)
- Branch/merge workflow (clean merges?)

### 3. Efficiency Score (1-10)
Evaluate resource usage:
- Token usage (reasonable for task complexity?)
- Cost efficiency
- Execution time
- Tool errors and retries
- Loops or stuck states
- Compactions (could they be avoided?)
- Subagent usage (appropriate?)

### 4. User Experience Score (1-10)
Evaluate the running application (if applicable):
- Does the app load and work correctly?
- Is navigation intuitive and clear?
- Do forms work with proper validation?
- Is feedback clear (loading, success, error states)?
- Does it look reasonable?
- Any console errors or warnings?
- Does it match what the README describes?
- Would a real user understand how to use it?

### 5. Overall Score (1-10)
Weighted: (implementation * 0.3) + (workflow * 0.2) + (efficiency * 0.2) + (ux * 0.3) + adjustment
Adjustment (-1 to +1) for: spec completion, critical failures, production-readiness, cohesiveness

## Output Format

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "implementation": {
    "score": <1-10>,
    "strengths": ["...", "..."],
    "weaknesses": ["...", "..."],
    "evidence": "Specific examples from the code/output"
  },
  "workflow": {
    "score": <1-10>,
    "strengths": ["...", "..."],
    "weaknesses": ["...", "..."],
    "evidence": "Specific examples from timeline/events"
  },
  "efficiency": {
    "score": <1-10>,
    "strengths": ["...", "..."],
    "weaknesses": ["...", "..."],
    "evidence": "Specific metrics and comparisons"
  },
  "ux": {
    "score": <1-10>,
    "strengths": ["...", "..."],
    "weaknesses": ["...", "..."],
    "evidence": "Observations about the application (if applicable)"
  },
  "overall": {
    "score": <1-10>,
    "adjustment": <-1 to 1>,
    "adjustmentReason": "Why adjustment was applied",
    "summary": "2-3 sentence overall assessment",
    "recommendations": ["...", "..."]
  }
}`;

/**
 * Load benchmark data from the results directory
 */
function loadBenchmarkData(resultsDir) {
  const data = {};

  // Load summary.json (required)
  const summaryPath = path.join(resultsDir, 'summary.json');
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`summary.json not found at ${summaryPath}`);
  }
  data.summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));

  // Load spec.md (required)
  const specPath = path.join(resultsDir, 'spec.md');
  if (fs.existsSync(specPath)) {
    data.spec = fs.readFileSync(specPath, 'utf-8');
  } else {
    data.spec = 'Spec file not found';
  }

  // Load timeline.jsonl (required for workflow analysis)
  const timelinePath = path.join(resultsDir, 'timeline.jsonl');
  if (fs.existsSync(timelinePath)) {
    data.timeline = fs.readFileSync(timelinePath, 'utf-8')
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  } else {
    data.timeline = [];
  }

  // Load task metrics
  data.tasks = {};
  const tasksDir = path.join(resultsDir, 'tasks');
  if (fs.existsSync(tasksDir)) {
    const taskDirs = fs.readdirSync(tasksDir);
    for (const taskId of taskDirs) {
      const taskDir = path.join(tasksDir, taskId);
      if (fs.statSync(taskDir).isDirectory()) {
        data.tasks[taskId] = {};

        // Load metrics.json
        const metricsPath = path.join(taskDir, 'metrics.json');
        if (fs.existsSync(metricsPath)) {
          data.tasks[taskId].metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'));
        }

        // Load errors.json
        const errorsPath = path.join(taskDir, 'errors.json');
        if (fs.existsSync(errorsPath)) {
          data.tasks[taskId].errors = JSON.parse(fs.readFileSync(errorsPath, 'utf-8'));
        }

        // Load tools.jsonl (sample first 50 entries)
        const toolsPath = path.join(taskDir, 'tools.jsonl');
        if (fs.existsSync(toolsPath)) {
          const lines = fs.readFileSync(toolsPath, 'utf-8').split('\n').filter(l => l.trim());
          data.tasks[taskId].tools = lines.slice(0, 50).map(l => JSON.parse(l));
          data.tasks[taskId].toolCount = lines.length;
        }

        // Load git-diff.patch (truncate if too long)
        const diffPath = path.join(taskDir, 'git-diff.patch');
        if (fs.existsSync(diffPath)) {
          const diff = fs.readFileSync(diffPath, 'utf-8');
          data.tasks[taskId].gitDiff = diff.length > 10000 ? diff.substring(0, 10000) + '\n... (truncated)' : diff;
        }
      }
    }
  }

  // Load permission data
  const permissionsDir = path.join(resultsDir, 'permissions');
  if (fs.existsSync(permissionsDir)) {
    const requestsPath = path.join(permissionsDir, 'requests.jsonl');
    if (fs.existsSync(requestsPath)) {
      data.permissionRequests = fs.readFileSync(requestsPath, 'utf-8')
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    }

    const decisionsPath = path.join(permissionsDir, 'decisions.jsonl');
    if (fs.existsSync(decisionsPath)) {
      data.permissionDecisions = fs.readFileSync(decisionsPath, 'utf-8')
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    }
  }

  return data;
}

/**
 * Format benchmark data for Claude analysis
 */
function formatDataForAnalysis(data) {
  const parts = [];

  // Summary overview
  parts.push('## Benchmark Summary\n');
  parts.push(`- Benchmark ID: ${data.summary.benchmarkId}`);
  parts.push(`- Outcome: ${data.summary.outcome}`);
  parts.push(`- Duration: ${data.summary.duration.totalMs}ms`);
  parts.push(`- Total Tokens: ${data.summary.tokens.total}`);
  parts.push(`- Total Cost: $${data.summary.cost.totalUsd.toFixed(4)}`);
  parts.push(`- Tasks: ${data.summary.tasks.completed}/${data.summary.tasks.total} completed`);
  parts.push(`- Cycles: ${data.summary.cycles.total}`);
  parts.push(`- Spec Completion: ${data.summary.spec.completionPercent.toFixed(1)}%`);
  parts.push('');

  // Workflow metrics
  parts.push('## Workflow Metrics\n');
  parts.push(`- Worktrees created: ${data.summary.workflow.worktreesCreated}`);
  parts.push(`- Worktrees merged: ${data.summary.workflow.worktreesMerged}`);
  parts.push(`- Worktrees discarded: ${data.summary.workflow.worktreesDiscarded}`);
  parts.push(`- Branches created: ${data.summary.workflow.branchesCreated}`);
  parts.push(`- Parallel tasks run: ${data.summary.workflow.parallelTasksRun}`);
  parts.push('');

  // Issues
  parts.push('## Issues Detected\n');
  parts.push(`- Loops detected: ${data.summary.issues.loopsDetected}`);
  parts.push(`- Compactions: ${data.summary.issues.compactions}`);
  parts.push(`- Tool errors: ${data.summary.issues.toolErrors}`);
  parts.push(`- Tool retries: ${data.summary.issues.toolRetries}`);
  parts.push(`- Stuck detections: ${data.summary.issues.stuckDetections}`);
  parts.push('');

  // Spec
  parts.push('## Specification\n');
  parts.push(data.spec.substring(0, 3000));
  if (data.spec.length > 3000) parts.push('\n... (truncated)');
  parts.push('');

  // Timeline highlights
  parts.push('## Timeline Highlights\n');
  const keyEvents = data.timeline.filter(e =>
    ['benchmark_start', 'benchmark_complete', 'task_start', 'task_complete',
      'cycle_start', 'cycle_complete', 'tool_error', 'loop_detected',
      'stuck_detected', 'permission_request'].includes(e.event)
  ).slice(0, 30);
  for (const event of keyEvents) {
    parts.push(`- [${new Date(event.timestamp).toISOString()}] ${event.event}: ${JSON.stringify(event).substring(0, 100)}`);
  }
  parts.push('');

  // Task details
  parts.push('## Task Details\n');
  for (const [taskId, taskData] of Object.entries(data.tasks)) {
    parts.push(`### Task: ${taskId}`);
    if (taskData.metrics) {
      parts.push(`- Status: ${taskData.metrics.status}`);
      parts.push(`- Tokens: ${taskData.metrics.inputTokens + taskData.metrics.outputTokens}`);
      parts.push(`- Cost: $${taskData.metrics.costUsd.toFixed(4)}`);
      parts.push(`- Tool calls: ${taskData.metrics.toolCalls}`);
      parts.push(`- Tool errors: ${taskData.metrics.toolErrors}`);
    }
    if (taskData.errors && taskData.errors.length > 0) {
      parts.push(`- Errors: ${taskData.errors.length}`);
      parts.push(`  First error: ${JSON.stringify(taskData.errors[0]).substring(0, 200)}`);
    }
    if (taskData.gitDiff) {
      parts.push('- Git diff (sample):');
      parts.push('```diff');
      parts.push(taskData.gitDiff.substring(0, 2000));
      parts.push('```');
    }
    parts.push('');
  }

  // Permission summary
  if (data.permissionRequests && data.permissionRequests.length > 0) {
    parts.push('## Permission Requests\n');
    parts.push(`Total requests: ${data.permissionRequests.length}`);
    const tools = {};
    for (const req of data.permissionRequests) {
      tools[req.tool] = (tools[req.tool] || 0) + 1;
    }
    for (const [tool, count] of Object.entries(tools)) {
      parts.push(`- ${tool}: ${count}`);
    }
  }

  return parts.join('\n');
}

/**
 * Run scoring using Claude CLI
 * Uses temp file for prompt to avoid Windows command line length limits
 */
async function scoreWithClaudeCli(analysisText) {
  return new Promise((resolve, reject) => {
    const prompt = `${SCORING_PROMPT}\n\n---\n\n${analysisText}`;

    // Write prompt to temp file to avoid Windows command line length limits (~32K chars)
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `nerv-score-prompt-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, prompt, 'utf-8');

    // Use Claude CLI with print mode for non-interactive scoring
    // Read prompt from stdin via file redirection
    const args = [
      '--print',
      '--output-format', 'json'
    ];

    // On Windows, use 'type' to pipe file; on Unix, use 'cat'
    const isWindows = process.platform === 'win32';
    const command = isWindows
      ? `type "${tempFile}" | claude ${args.join(' ')}`
      : `cat "${tempFile}" | claude ${args.join(' ')}`;

    const claude = spawn(command, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });

    let stdout = '';
    let stderr = '';

    claude.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    claude.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    claude.on('close', (code) => {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch {}

      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        // Parse the response - Claude CLI with --output-format json returns structured output
        const response = JSON.parse(stdout);
        // Extract the text content from the response
        let scoreText = '';
        if (response.result) {
          scoreText = response.result;
        } else if (response.content && Array.isArray(response.content)) {
          for (const block of response.content) {
            if (block.type === 'text') {
              scoreText += block.text;
            }
          }
        } else {
          scoreText = stdout;
        }

        // Extract JSON from the response text
        const jsonMatch = scoreText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON object found in Claude response');
        }

        const scores = JSON.parse(jsonMatch[0]);
        resolve(scores);
      } catch (err) {
        // Try to parse stdout directly as JSON
        try {
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const scores = JSON.parse(jsonMatch[0]);
            resolve(scores);
            return;
          }
        } catch {}
        reject(new Error(`Failed to parse Claude response: ${err.message}\nResponse: ${stdout.substring(0, 500)}`));
      }
    });

    claude.on('error', (err) => {
      // Clean up temp file on error
      try {
        fs.unlinkSync(tempFile);
      } catch {}
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });
  });
}

/**
 * Score using Anthropic API directly
 */
async function scoreWithApi(analysisText) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  // Dynamic import for ES module
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const prompt = `${SCORING_PROMPT}\n\n---\n\n${analysisText}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  const scoreText = response.content[0].text;

  // Extract JSON from the response
  const jsonMatch = scoreText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in Claude response');
  }

  return JSON.parse(jsonMatch[0]);
}

/**
 * Main scoring function
 */
async function scoreBenchmark(resultsDir) {
  console.log(`\nLoading benchmark data from: ${resultsDir}`);

  // Load data
  const data = loadBenchmarkData(resultsDir);
  console.log(`Loaded benchmark: ${data.summary.benchmarkId}`);

  // Format for analysis
  const analysisText = formatDataForAnalysis(data);
  console.log(`Prepared ${analysisText.length} characters of analysis data`);

  // Score with Claude
  console.log('\nScoring with Claude...');

  let scores;
  try {
    // Try CLI first
    scores = await scoreWithClaudeCli(analysisText);
  } catch (cliErr) {
    console.log(`Claude CLI failed: ${cliErr.message}`);
    console.log('Falling back to Anthropic API...');

    try {
      scores = await scoreWithApi(analysisText);
    } catch (apiErr) {
      throw new Error(`Both Claude CLI and API failed:\n  CLI: ${cliErr.message}\n  API: ${apiErr.message}`);
    }
  }

  // Update summary.json with scores
  data.summary.scores = {
    implementation: scores.implementation.score,
    workflow: scores.workflow.score,
    efficiency: scores.efficiency.score,
    ux: scores.ux?.score || null,
    overall: scores.overall.score
  };
  data.summary.scoreDetails = scores;

  fs.writeFileSync(
    path.join(resultsDir, 'summary.json'),
    JSON.stringify(data.summary, null, 2)
  );

  // Append to history
  const historyDir = path.join(os.homedir(), '.nerv', 'benchmarks');
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }

  const historyPath = path.join(historyDir, 'history.jsonl');
  fs.appendFileSync(historyPath, JSON.stringify({
    benchmarkId: data.summary.benchmarkId,
    timestamp: data.summary.timestamp,
    nervVersion: data.summary.nervVersion,
    spec: data.summary.specFile,
    outcome: data.summary.outcome,
    scores: data.summary.scores,
    duration: data.summary.duration.totalMs,
    cost: data.summary.cost.totalUsd,
    tokens: data.summary.tokens.total
  }) + '\n');

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('BENCHMARK SCORES');
  console.log('='.repeat(60));
  console.log(`Implementation Quality: ${scores.implementation.score}/10`);
  console.log(`  Strengths: ${scores.implementation.strengths.join(', ')}`);
  console.log(`  Weaknesses: ${scores.implementation.weaknesses.join(', ')}`);
  console.log('');
  console.log(`Workflow Quality: ${scores.workflow.score}/10`);
  console.log(`  Strengths: ${scores.workflow.strengths.join(', ')}`);
  console.log(`  Weaknesses: ${scores.workflow.weaknesses.join(', ')}`);
  console.log('');
  console.log(`Efficiency: ${scores.efficiency.score}/10`);
  console.log(`  Strengths: ${scores.efficiency.strengths.join(', ')}`);
  console.log(`  Weaknesses: ${scores.efficiency.weaknesses.join(', ')}`);
  console.log('');
  console.log(`User Experience: ${scores.ux?.score || 'N/A'}/10`);
  if (scores.ux) {
    console.log(`  Strengths: ${scores.ux.strengths.join(', ')}`);
    console.log(`  Weaknesses: ${scores.ux.weaknesses.join(', ')}`);
  } else {
    console.log(`  (No runnable application found for UX testing)`);
  }
  console.log('');
  console.log(`OVERALL: ${scores.overall.score}/10`);
  console.log(`  ${scores.overall.summary}`);
  console.log('');
  console.log('Recommendations:');
  scores.overall.recommendations.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
  console.log('='.repeat(60));
  console.log('');
  console.log(`Results saved to: ${path.join(resultsDir, 'summary.json')}`);
  console.log(`History appended to: ${historyPath}`);

  return scores;
}

// Main
const resultsDir = process.argv[2];
if (!resultsDir) {
  console.error('Usage: node scripts/score-benchmark.js <benchmark-results-dir>');
  process.exit(1);
}

if (!fs.existsSync(resultsDir)) {
  console.error(`Error: Directory not found: ${resultsDir}`);
  process.exit(1);
}

scoreBenchmark(resultsDir)
  .then(scores => {
    // Exit with 0 if overall score >= 7 (passing)
    if (scores.overall.score >= 7) {
      console.log('\n✓ Benchmark PASSED (score >= 7)');
      process.exit(0);
    } else {
      console.log('\n✗ Benchmark FAILED (score < 7)');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('Scoring failed:', err);
    process.exit(1);
  });
