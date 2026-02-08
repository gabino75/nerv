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

### Via Config File

Create agents in `~/.nerv/agents/`:

```yaml
# ~/.nerv/agents/api-builder.yaml
name: API Builder
description: Builds REST APIs with best practices

system_prompt: |
  You are an expert API developer. When building APIs:
  - Follow REST conventions
  - Use proper HTTP status codes
  - Include input validation
  - Add error handling
  - Write OpenAPI documentation

model: claude-sonnet-4-20250514
temperature: 0.3

tools:
  allowed:
    - Read
    - Write
    - Edit
    - Bash
  restricted:
    - Bash(rm -rf *)
```

## Agent Configuration

### System Prompt

The system prompt defines the agent's persona and instructions:

```yaml
system_prompt: |
  You are a security-focused code reviewer.

  When reviewing code:
  1. Check for OWASP top 10 vulnerabilities
  2. Identify hardcoded credentials
  3. Review input validation
  4. Check authentication logic
```

### Tools

Control which tools the agent can use:

```yaml
tools:
  allowed:
    - Read
    - Grep
    - Glob
  restricted:
    - Write
    - Edit
    - Bash
```

### Model Selection

Choose the appropriate model:

```yaml
model: claude-sonnet-4-20250514  # Balanced
model: claude-opus-4-20250514    # Most capable
```

### Temperature

Control response variability:

```yaml
temperature: 0.0  # Deterministic (tests, reviews)
temperature: 0.5  # Balanced (general coding)
temperature: 1.0  # Creative (brainstorming)
```

## Project-Specific Agents

Define agents for specific projects in `.nerv/agents/`:

```yaml
# .nerv/agents/frontend-dev.yaml
name: Frontend Developer
description: React/TypeScript specialist

system_prompt: |
  You specialize in React with TypeScript.
  Follow these patterns:
  - Functional components with hooks
  - TypeScript strict mode
  - CSS modules or Tailwind
```

## Sharing Agents

### Export

```bash
nerv agent export <name> > agent.yaml
```

### Import

```bash
nerv agent import < agent.yaml
```

### Organization Agents

Organizations can define shared agents via org config:

```json
{
  "agents": [
    {
      "name": "company-standard",
      "config_url": "https://config.company.com/agents/standard.yaml"
    }
  ]
}
```

## Best Practices

1. **Be specific** - Clear instructions produce better results
2. **Include examples** - Show the agent what you want
3. **Restrict tools** - Only allow what's needed
4. **Test and iterate** - Refine based on results
5. **Share with team** - Consistent patterns across developers
