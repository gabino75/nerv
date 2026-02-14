# Custom Agents

Define specialized agents for different types of tasks.

## Overview

Agents are configurations that customize Claude's behavior for specific use cases:

- **System prompt** - Instructions and context
- **Tools allowed** - Which tools the agent can use
- **Temperature** - Creativity level
- **Model** - Which Claude model to use

## Built-in Agents

NERV includes several built-in agents:

| Agent | Best For |
|-------|----------|
| `default` | General-purpose tasks |
| `builder` | Feature implementation |
| `planner` | Architecture design |
| `researcher` | Exploration and research |
| `reviewer` | Code review |
| `debugger` | Bug investigation |
| `auditor` | Code health, spec drift detection |

## Using Agents

### Via UI

When starting a session, select an agent from the dropdown.

### Via CLI

```bash
# Start with a specific agent
nerv start --agent researcher

# Start task with agent
nerv start <taskId> --agent builder
```

## Creating Custom Agents

### Via UI

1. Open **Knowledge > Agents**
2. Click **"New Agent"**
3. Configure the agent settings
4. Save

### Via CLI

```bash
# Create a new agent
nerv agent create my-agent

# Edit an existing agent
nerv agent edit my-agent

# Delete an agent
nerv agent delete my-agent

# List all agents
nerv agents

# List with tool access details
nerv agents --verbose
```

Agents are stored in the SQLite database, not as YAML files on disk.

## Agent Configuration

When creating or editing an agent, you can configure:

### System Prompt

The system prompt defines the agent's persona and instructions:

```
You are a security-focused code reviewer.

When reviewing code:
1. Check for OWASP top 10 vulnerabilities
2. Identify hardcoded credentials
3. Review input validation
4. Check authentication logic
```

### Tools

Control which tools the agent can use:

- **Allowed:** Read, Write, Edit, Bash, Grep, Glob
- **Restricted:** Specific tool patterns to block

### Model Selection

Choose the appropriate model:

- `claude-sonnet-4-20250514` - Balanced speed and capability
- `claude-opus-4-20250514` - Most capable

### Temperature

Control response variability:

- `0.0` - Deterministic (tests, reviews)
- `0.5` - Balanced (general coding)
- `1.0` - Creative (brainstorming)

## Organization Agents

Organizations can define shared agents via org config:

```bash
# List organization agents
nerv org agents

# Sync organization config
nerv org sync
```

Organization agents are distributed via the org config system and appear alongside your custom agents.

## Best Practices

1. **Be specific** - Clear instructions produce better results
2. **Include examples** - Show the agent what you want
3. **Restrict tools** - Only allow what's needed
4. **Test and iterate** - Refine based on results
5. **Share with team** - Consistent patterns across developers
