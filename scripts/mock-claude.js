#!/usr/bin/env node
/**
 * Mock Claude Code CLI for E2E Testing
 *
 * Simulates Claude Code's stream-json output format for testing NERV
 * without requiring real API tokens or Claude Code CLI.
 *
 * Usage:
 *   node mock-claude.js [--output-format stream-json] <prompt>
 *
 * Environment Variables:
 *   MOCK_CLAUDE_SCENARIO - Which scenario to simulate:
 *     - 'simple_task' (default): Quick task completion
 *     - 'permission_required': Triggers approval queue
 *     - 'error': Simulates an error condition
 *     - 'long_running': Slow task with progress
 *     - 'spec_building': Builds spec via conversation
 *     - 'parallel_yolo': Parallel subagent simulation
 *     - 'audit': Code health audit with JSON schema output
 *     - 'review_gate': AI review with benchmark scoring
 *     - 'multi_cycle': Full development cycle
 *     - 'benchmark_full': Complete benchmark workflow
 */

const args = process.argv.slice(2);
const prompt = args.filter(a => !a.startsWith('--')).join(' ');
const scenario = process.env.MOCK_CLAUDE_SCENARIO || 'simple_task';
const outputFormat = args.includes('stream-json') || args.includes('--output-format');

// Generate a mock session ID
const sessionId = `mock-session-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

// Helper to emit stream-json message
function emit(msg) {
  if (outputFormat) {
    console.log(JSON.stringify(msg));
  } else {
    // Plain text fallback
    if (msg.message?.content) {
      for (const content of msg.message.content) {
        if (content.text) console.log(content.text);
      }
    }
  }
}

// Helper for delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Scenario: Simple task completion
async function simpleTask() {
  // Init message
  emit({
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Task', 'TaskOutput', 'TaskStop']
  });

  await delay(100);

  // First assistant message - thinking
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'I\'ll help you with this task. Let me analyze the codebase first.' }
      ]
    },
    usage: {
      input_tokens: 1500,
      output_tokens: 25,
      cache_read_input_tokens: 500,
      cache_creation_input_tokens: 0
    }
  });

  await delay(200);

  // Tool use - reading file
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', name: 'Read', tool_use_id: 'read_1', input: { file_path: 'index.js' } }
      ]
    },
    usage: {
      input_tokens: 1600,
      output_tokens: 50,
      cache_read_input_tokens: 500,
      cache_creation_input_tokens: 0
    }
  });

  await delay(150);

  // Tool result (simulated)
  emit({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'read_1', content: 'const http = require("http");\n\nconst server = http.createServer((req, res) => {\n  res.writeHead(200);\n  res.end("Hello");\n});\n\nserver.listen(3000);' }
      ]
    }
  });

  await delay(200);

  // Writing the solution
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'I see the current server implementation. I\'ll add the health endpoint now.' },
        { type: 'tool_use', name: 'Edit', tool_use_id: 'edit_1', input: { file_path: 'index.js', old_string: 'res.end("Hello")', new_string: 'if (req.url === "/health") {\n    res.writeHead(200, {"Content-Type": "application/json"});\n    res.end(JSON.stringify({status: "ok"}));\n    return;\n  }\n  res.end("Hello")' } }
      ]
    },
    usage: {
      input_tokens: 2000,
      output_tokens: 150,
      cache_read_input_tokens: 800,
      cache_creation_input_tokens: 0
    }
  });

  await delay(150);

  // Tool result
  emit({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'edit_1', content: 'File edited successfully' }
      ]
    }
  });

  await delay(200);

  // Final response
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'Done! I\'ve added a /health endpoint that returns {"status": "ok"}. The endpoint:\n\n1. Listens for GET requests to /health\n2. Returns a JSON response with status "ok"\n3. Uses proper Content-Type header\n\nYou can test it with: curl http://localhost:3000/health' }
      ]
    },
    usage: {
      input_tokens: 2200,
      output_tokens: 80,
      cache_read_input_tokens: 1000,
      cache_creation_input_tokens: 0
    }
  });

  await delay(100);

  // Result message (task complete)
  emit({
    type: 'result',
    result: {
      cost_usd: 0.0045,
      duration_ms: 3500,
      num_turns: 3
    },
    session_id: sessionId
  });
}

// Scenario: Permission required (triggers approval queue)
async function permissionRequired() {
  emit({
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob']
  });

  await delay(100);

  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'I\'ll clean up node_modules and reinstall dependencies.' }
      ]
    },
    usage: { input_tokens: 1000, output_tokens: 20 }
  });

  await delay(200);

  // Dangerous command that should trigger approval
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', name: 'Bash', tool_use_id: 'bash_1', input: { command: 'rm -rf node_modules' } }
      ]
    },
    usage: { input_tokens: 1100, output_tokens: 30 }
  });

  // Wait for approval (in real scenario, hook would intercept)
  await delay(5000);

  emit({
    type: 'result',
    result: {
      cost_usd: 0.002,
      duration_ms: 5200,
      num_turns: 2
    },
    session_id: sessionId
  });
}

// Scenario: Error condition
async function errorScenario() {
  emit({
    type: 'system',
    subtype: 'init',
    session_id: sessionId
  });

  await delay(100);

  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'I\'ll try to accomplish this task...' }
      ]
    },
    usage: { input_tokens: 500, output_tokens: 10 }
  });

  await delay(200);

  // Simulate error
  emit({
    type: 'system',
    subtype: 'error',
    error: {
      type: 'max_budget_exceeded',
      message: 'Maximum budget of $5.00 exceeded'
    }
  });

  emit({
    type: 'result',
    result: {
      cost_usd: 5.01,
      duration_ms: 300,
      num_turns: 5
    },
    session_id: sessionId
  });
}

// Scenario: Long running task with progress
async function longRunning() {
  emit({
    type: 'system',
    subtype: 'init',
    session_id: sessionId
  });

  const steps = [
    'Analyzing codebase structure...',
    'Reading existing files...',
    'Planning implementation...',
    'Writing new code...',
    'Running tests...',
    'Fixing test failures...',
    'Final verification...',
    'Task complete!'
  ];

  let tokens = 1000;
  for (const step of steps) {
    await delay(500);
    tokens += 200;

    emit({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: step }]
      },
      usage: {
        input_tokens: tokens,
        output_tokens: 20,
        cache_read_input_tokens: Math.floor(tokens * 0.3)
      }
    });
  }

  await delay(200);

  emit({
    type: 'result',
    result: {
      cost_usd: 0.015,
      duration_ms: 4500,
      num_turns: 8
    },
    session_id: sessionId
  });
}

// Scenario: Spec Building - asks clarifying questions, produces task breakdown
async function specBuilding() {
  emit({
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'AskUserQuestion', 'Task']
  });

  await delay(100);

  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'I\'ll help you build a detailed spec for this feature. Let me first understand your codebase structure.' }
      ]
    },
    usage: { input_tokens: 1500, output_tokens: 30 }
  });

  await delay(200);

  // Explore codebase
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', name: 'Glob', tool_use_id: 'glob_1', input: { pattern: 'src/**/*.ts' } }
      ]
    },
    usage: { input_tokens: 1600, output_tokens: 40 }
  });

  await delay(150);

  emit({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'glob_1', content: 'src/main/index.ts\nsrc/main/database.ts\nsrc/renderer/App.svelte' }
      ]
    }
  });

  await delay(200);

  // Ask clarifying question
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'I see your project structure. Before I create the spec, I have a few questions:' },
        {
          type: 'tool_use',
          name: 'AskUserQuestion',
          tool_use_id: 'ask_1',
          input: {
            questions: [
              {
                question: 'Which OAuth2 providers should we support?',
                header: 'Providers',
                options: [
                  { label: 'Google + GitHub (Recommended)', description: 'Most common combination for developer tools' },
                  { label: 'Google only', description: 'Simpler implementation' },
                  { label: 'GitHub only', description: 'Good for developer-focused apps' }
                ],
                multiSelect: false
              }
            ]
          }
        }
      ]
    },
    usage: { input_tokens: 2000, output_tokens: 100 }
  });

  await delay(300);

  // Simulated user response
  emit({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'ask_1', content: 'User selected: Google + GitHub (Recommended)' }
      ]
    }
  });

  await delay(200);

  // Generate task breakdown with JSON schema format
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'Based on your requirements, here\'s the task breakdown:\n\n```json\n{\n  "tasks": [\n    {\n      "id": "T001",\n      "title": "OAuth2 Callback Endpoint",\n      "description": "Implement backend /auth/callback endpoint for OAuth2 flow",\n      "worktree": "task-001-oauth-backend",\n      "dependencies": []\n    },\n    {\n      "id": "T002",\n      "title": "Frontend Login UI",\n      "description": "Build login form with Google/GitHub buttons",\n      "worktree": "task-002-login-ui",\n      "dependencies": ["T001"]\n    },\n    {\n      "id": "T003",\n      "title": "JWT Token Storage",\n      "description": "Secure token storage with refresh logic",\n      "worktree": "task-003-tokens",\n      "dependencies": ["T001"]\n    },\n    {\n      "id": "T004",\n      "title": "E2E Authentication Tests",\n      "description": "Write E2E tests for full auth flow",\n      "worktree": "task-004-auth-tests",\n      "dependencies": ["T002", "T003"]\n    }\n  ]\n}\n```\n\nThis creates 4 tasks that can be worked on with some parallelization.' }
      ]
    },
    usage: { input_tokens: 2500, output_tokens: 300 }
  });

  await delay(100);

  emit({
    type: 'result',
    result: {
      cost_usd: 0.012,
      duration_ms: 2500,
      num_turns: 4
    },
    session_id: sessionId
  });
}

// Scenario: Parallel YOLO - spawns background subagents
async function parallelYolo() {
  emit({
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Task', 'TaskOutput', 'TaskStop']
  });

  await delay(100);

  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'I\'ll execute these tasks in parallel using subagents. Let me spawn background workers for each worktree.' }
      ]
    },
    usage: { input_tokens: 1500, output_tokens: 35 }
  });

  await delay(200);

  // Spawn parallel subagents using Task tool
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'Spawning parallel subagents...' },
        {
          type: 'tool_use',
          name: 'Task',
          tool_use_id: 'task_1',
          input: {
            description: 'Implement backend API',
            prompt: 'Implement the OAuth2 callback endpoint in task-001-backend worktree',
            subagent_type: 'general-purpose',
            run_in_background: true
          }
        },
        {
          type: 'tool_use',
          name: 'Task',
          tool_use_id: 'task_2',
          input: {
            description: 'Build frontend UI',
            prompt: 'Build the login form component in task-002-frontend worktree',
            subagent_type: 'general-purpose',
            run_in_background: true
          }
        },
        {
          type: 'tool_use',
          name: 'Task',
          tool_use_id: 'task_3',
          input: {
            description: 'Write E2E tests',
            prompt: 'Write authentication E2E tests in task-003-tests worktree',
            subagent_type: 'general-purpose',
            run_in_background: true
          }
        }
      ]
    },
    usage: { input_tokens: 2000, output_tokens: 200 }
  });

  await delay(500);

  // Subagent results
  const subagentIds = [
    `subagent-${Date.now()}-backend`,
    `subagent-${Date.now()}-frontend`,
    `subagent-${Date.now()}-tests`
  ];

  emit({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'task_1', content: `Background task started. Agent ID: ${subagentIds[0]}. Output file: /tmp/agent-backend.out` },
        { type: 'tool_result', tool_use_id: 'task_2', content: `Background task started. Agent ID: ${subagentIds[1]}. Output file: /tmp/agent-frontend.out` },
        { type: 'tool_result', tool_use_id: 'task_3', content: `Background task started. Agent ID: ${subagentIds[2]}. Output file: /tmp/agent-tests.out` }
      ]
    }
  });

  await delay(300);

  // Check on subagent progress
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'Subagents are running. Let me check their progress...' },
        {
          type: 'tool_use',
          name: 'TaskOutput',
          tool_use_id: 'output_1',
          input: {
            task_id: subagentIds[0],
            block: false,
            timeout: 1000
          }
        }
      ]
    },
    usage: { input_tokens: 2500, output_tokens: 80 }
  });

  await delay(200);

  emit({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'output_1', content: 'Task in progress... Backend API 60% complete. Implementing OAuth callback handler.' }
      ]
    }
  });

  await delay(300);

  // Final summary
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: `All 3 parallel subagents are executing:\n\n1. Backend API (${subagentIds[0]}): 60% complete\n2. Frontend UI (${subagentIds[1]}): Running...\n3. E2E Tests (${subagentIds[2]}): Running...\n\nI\'ll continue monitoring and merge results when all complete.` }
      ]
    },
    usage: { input_tokens: 3000, output_tokens: 100 }
  });

  await delay(100);

  emit({
    type: 'result',
    result: {
      cost_usd: 0.025,
      duration_ms: 3500,
      num_turns: 5,
      subagents: subagentIds
    },
    session_id: sessionId
  });
}

// Scenario: Audit - code health + spec drift with JSON schema output
async function auditScenario() {
  emit({
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Task']
  });

  await delay(100);

  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'Running code health audit and spec drift detection...' }
      ]
    },
    usage: { input_tokens: 1500, output_tokens: 20 }
  });

  await delay(200);

  // Analyze codebase
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', name: 'Bash', tool_use_id: 'bash_1', input: { command: 'npm run typecheck' } },
        { type: 'tool_use', name: 'Bash', tool_use_id: 'bash_2', input: { command: 'npm run test:unit -- --coverage' } }
      ]
    },
    usage: { input_tokens: 1700, output_tokens: 60 }
  });

  await delay(300);

  emit({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'bash_1', content: 'TypeScript compilation successful. No errors.' },
        { type: 'tool_result', tool_use_id: 'bash_2', content: 'Test Suites: 5 passed\nTests: 47 passed\nCoverage: 78.5%' }
      ]
    }
  });

  await delay(200);

  // Output audit report with JSON schema format
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'Audit complete. Here\'s the full report:\n\n```json\n{\n  "codeHealth": {\n    "testCoverage": 78.5,\n    "dryScore": 92,\n    "typeSafety": 100,\n    "deadCode": 3\n  },\n  "specDrift": {\n    "conformanceScore": 85,\n    "missingFeatures": ["Dark mode toggle", "Export to CSV"],\n    "extraFeatures": ["Notification sounds"]\n  },\n  "overallScore": 82,\n  "needsRefactor": false\n}\n```\n\n**Summary:**\n- Test coverage is good (78.5%)\n- No type safety issues\n- Minor spec drift detected: 2 missing features, 1 extra feature\n- Overall score: 82/100 - Acceptable for merge' }
      ]
    },
    usage: { input_tokens: 2500, output_tokens: 250 }
  });

  await delay(100);

  emit({
    type: 'result',
    result: {
      cost_usd: 0.018,
      duration_ms: 2000,
      num_turns: 3
    },
    session_id: sessionId
  });
}

// Scenario: Review Gate - AI review with benchmark scoring
async function reviewGate() {
  emit({
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'WebFetch']
  });

  await delay(100);

  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'Performing AI review and benchmark scoring for merge decision...' }
      ]
    },
    usage: { input_tokens: 1500, output_tokens: 20 }
  });

  await delay(200);

  // Review code changes
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', name: 'Bash', tool_use_id: 'bash_1', input: { command: 'git diff main...HEAD' } },
        { type: 'tool_use', name: 'Bash', tool_use_id: 'bash_2', input: { command: 'npm run test:e2e' } }
      ]
    },
    usage: { input_tokens: 1700, output_tokens: 60 }
  });

  await delay(400);

  emit({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'bash_1', content: 'diff --git a/src/auth.ts b/src/auth.ts\n+export function handleOAuthCallback(code: string) {\n+  // OAuth callback implementation\n+}' },
        { type: 'tool_result', tool_use_id: 'bash_2', content: 'E2E Tests: 33 passed, 0 failed' }
      ]
    }
  });

  await delay(200);

  // Output review decision with JSON schema format
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'Review complete. Here\'s my assessment:\n\n```json\n{\n  "passed": true,\n  "benchmarkScore": 88,\n  "functionalityScore": 95,\n  "specAdherence": 85,\n  "codeQuality": 90,\n  "issues": [\n    "Minor: Missing JSDoc on handleOAuthCallback",\n    "Minor: Consider adding retry logic for token refresh"\n  ],\n  "recommendation": "merge"\n}\n```\n\n**Recommendation: MERGE**\n\nThe implementation passes all E2E tests, adheres to the spec, and follows code quality standards. Two minor issues noted but not blocking.' }
      ]
    },
    usage: { input_tokens: 2500, output_tokens: 200 }
  });

  await delay(100);

  emit({
    type: 'result',
    result: {
      cost_usd: 0.015,
      duration_ms: 2500,
      num_turns: 3
    },
    session_id: sessionId
  });
}

// Scenario: Multi-Cycle - full development cycle
async function multiCycle() {
  emit({
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Task', 'TaskOutput']
  });

  await delay(100);

  const cycles = [
    { name: 'Cycle 0: Proof of Life', action: 'Verifying API connectivity...' },
    { name: 'Cycle 1: Core Implementation', action: 'Implementing OAuth callback...' },
    { name: 'Cycle 2: Frontend Integration', action: 'Building login UI...' },
    { name: 'Cycle 3: Testing & Polish', action: 'Running E2E tests...' }
  ];

  let tokens = 1500;
  for (const cycle of cycles) {
    emit({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: `\n=== ${cycle.name} ===\n${cycle.action}` }
        ]
      },
      usage: { input_tokens: tokens, output_tokens: 30 }
    });
    tokens += 500;
    await delay(400);
  }

  // Final audit
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: '\n=== Final Audit ===\nRunning code health and spec drift checks...' },
        { type: 'tool_use', name: 'Bash', tool_use_id: 'final_audit', input: { command: 'npm run typecheck && npm run test:unit && npm run test:e2e' } }
      ]
    },
    usage: { input_tokens: tokens, output_tokens: 50 }
  });

  await delay(300);

  emit({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'final_audit', content: 'All checks passed!\nTypecheck: OK\nUnit tests: 47/47 passed\nE2E tests: 33/33 passed' }
      ]
    }
  });

  await delay(200);

  // Final decision
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: '\n=== Multi-Cycle Complete ===\n\nAll 4 cycles completed successfully without human intervention.\n\n**Final Report:**\n```json\n{\n  "cyclesCompleted": 4,\n  "totalTasks": 6,\n  "testsPassRate": 100,\n  "codeHealthScore": 88,\n  "specAdherence": 92,\n  "recommendation": "merge",\n  "humanInterventionRequired": false\n}\n```\n\nReady for merge to main branch.' }
      ]
    },
    usage: { input_tokens: tokens + 500, output_tokens: 150 }
  });

  await delay(100);

  emit({
    type: 'result',
    result: {
      cost_usd: 0.045,
      duration_ms: 8000,
      num_turns: 8,
      cycles_completed: 4
    },
    session_id: sessionId
  });
}

// Scenario: Full benchmark workflow
async function benchmarkFull() {
  emit({
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Task', 'TaskOutput', 'AskUserQuestion']
  });

  await delay(100);

  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: '=== NERV BENCHMARK: Full Workflow ===\n\nExecuting complete development cycle...' }
      ]
    },
    usage: { input_tokens: 1500, output_tokens: 25 }
  });

  await delay(200);

  // Phase 1: Read & Analyze
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: '\n[Phase 1/4] Analyzing task and codebase...' },
        { type: 'tool_use', name: 'Read', tool_use_id: 'read_1', input: { file_path: 'package.json' } }
      ]
    },
    usage: { input_tokens: 1600, output_tokens: 40 }
  });

  await delay(150);

  emit({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'read_1', content: '{"name": "test-app", "version": "1.0.0"}' }
      ]
    }
  });

  await delay(200);

  // Phase 2: Implement
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: '\n[Phase 2/4] Implementing solution...' },
        { type: 'tool_use', name: 'Edit', tool_use_id: 'edit_1', input: { file_path: 'index.js', old_string: '// TODO', new_string: 'app.get("/health", (req, res) => res.json({status: "ok"}));' } }
      ]
    },
    usage: { input_tokens: 2000, output_tokens: 80 }
  });

  await delay(150);

  emit({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'edit_1', content: 'File edited successfully' }
      ]
    }
  });

  await delay(200);

  // Phase 3: Test
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: '\n[Phase 3/4] Running tests...' },
        { type: 'tool_use', name: 'Bash', tool_use_id: 'test_1', input: { command: 'npm test' } }
      ]
    },
    usage: { input_tokens: 2200, output_tokens: 40 }
  });

  await delay(150);

  emit({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'test_1', content: 'All tests passed!' }
      ]
    }
  });

  await delay(200);

  // Phase 4: Finalize
  emit({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: '\n[Phase 4/4] Finalizing...\n\n=== BENCHMARK COMPLETE ===\n\nAll phases executed successfully:\n- Analysis: Complete\n- Implementation: Complete  \n- Testing: All passed\n- Review: Ready for merge\n\nBenchmark Score: 92/100' }
      ]
    },
    usage: { input_tokens: 2500, output_tokens: 80 }
  });

  await delay(100);

  emit({
    type: 'result',
    result: {
      cost_usd: 0.022,
      duration_ms: 3500,
      num_turns: 5,
      benchmark_score: 92
    },
    session_id: sessionId
  });
}

// Main execution
async function main() {
  // Log startup info to stderr (won't interfere with JSON output)
  console.error(`[mock-claude] Starting scenario: ${scenario}`);
  console.error(`[mock-claude] Prompt: ${prompt.substring(0, 50)}...`);
  console.error(`[mock-claude] Session ID: ${sessionId}`);

  switch (scenario) {
    case 'permission_required':
      await permissionRequired();
      break;
    case 'error':
      await errorScenario();
      break;
    case 'long_running':
      await longRunning();
      break;
    case 'spec_building':
      await specBuilding();
      break;
    case 'parallel_yolo':
      await parallelYolo();
      break;
    case 'audit':
      await auditScenario();
      break;
    case 'review_gate':
      await reviewGate();
      break;
    case 'multi_cycle':
      await multiCycle();
      break;
    case 'benchmark':
    case 'benchmark_full':
      await benchmarkFull();
      break;
    case 'simple_task':
    default:
      await simpleTask();
      break;
  }

  console.error('[mock-claude] Scenario complete');
  process.exit(0);
}

main().catch(err => {
  console.error('[mock-claude] Error:', err);
  process.exit(1);
});
