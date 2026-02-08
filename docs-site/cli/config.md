# Config Commands

Manage NERV settings.

## `nerv config list`

List all settings with their sources.

```bash
nerv config list [--json]
```

**Options:**
- `--json` - Output in JSON format

**Output:**
```
Setting                      Value              Source
───────────────────────────  ─────────────────  ────────
default_model                claude-sonnet      global
monthly_budget_usd           50.00              env
yolo_max_cycles              10                 default
terminal_cols                120                project
```

## `nerv config get`

Get a specific setting value.

```bash
nerv config get <key> [--json]
```

**Arguments:**
- `<key>` - Setting key

**Examples:**
```bash
nerv config get default_model
# claude-sonnet-4-20250514

nerv config get monthly_budget_usd --json
# {"key":"monthly_budget_usd","value":50,"source":"global"}
```

## `nerv config set`

Set a setting value.

```bash
nerv config set <key> <value> [--project]
```

**Arguments:**
- `<key>` - Setting key
- `<value>` - Setting value

**Options:**
- `--project`, `-p` - Set at project level (default: global)

**Type Inference:** Values are auto-typed:
- `true`/`false` → boolean
- Numbers → number
- Everything else → string

**Examples:**
```bash
# Set global budget
nerv config set monthly_budget_usd 50

# Set project-specific model
nerv config set default_model claude-opus --project

# Set boolean
nerv config set notifications_enabled false
```

## `nerv config unset`

Remove a setting from config file.

```bash
nerv config unset <key> [--project]
```

**Aliases:** `delete`, `remove`

**Examples:**
```bash
# Remove global setting
nerv config unset monthly_budget_usd

# Remove project setting
nerv config unset default_model --project
```

## `nerv config path`

Show config file paths.

```bash
nerv config path
```

**Output:**
```
Global config: ~/.nerv/config.json
Project config: /home/user/project/.nerv/config.json

Environment overrides:
- NERV_MONTHLY_BUDGET_USD=100
- NERV_LOG_LEVEL=debug
```

## Available Settings

### Model Settings

| Setting | Type | Description | Default |
|---------|------|-------------|---------|
| `default_model` | string | Claude model to use | `claude-sonnet-4-20250514` |
| `max_turns` | number | Max conversation turns | 100 |

### Budget Settings

| Setting | Type | Description | Default |
|---------|------|-------------|---------|
| `monthly_budget_usd` | number | Monthly budget limit | 100 |
| `budget_warning_threshold` | number | Warning at % of budget (0-1) | 0.75 |
| `budget_critical_threshold` | number | Critical at % of budget (0-1) | 0.9 |

### Audit Settings

| Setting | Type | Description | Default |
|---------|------|-------------|---------|
| `audit_cycle_frequency` | number | Run audit every N cycles | 3 |
| `audit_test_coverage_threshold` | number | Minimum test coverage % | 80 |
| `audit_dry_violation_limit` | number | Max DRY violations | 5 |
| `audit_type_error_limit` | number | Max type errors | 0 |
| `audit_enable_code_health` | boolean | Enable code health checks | true |
| `audit_enable_plan_health` | boolean | Enable plan health checks | true |

### YOLO Settings

| Setting | Type | Description | Default |
|---------|------|-------------|---------|
| `yolo_max_cycles` | number | Max cycles in YOLO mode | 10 |
| `yolo_max_cost_usd` | number | Cost limit for YOLO | 5 |
| `yolo_max_duration_ms` | number | Time limit for YOLO | 3600000 |
| `yolo_auto_approve_review` | boolean | Auto-approve reviews | false |
| `yolo_auto_approve_dangerous_tools` | boolean | Auto-approve dangerous tools | false |

### Terminal Settings

| Setting | Type | Description | Default |
|---------|------|-------------|---------|
| `terminal_cols` | number | Terminal columns | 120 |
| `terminal_rows` | number | Terminal rows | 30 |

### Logging Settings

| Setting | Type | Description | Default |
|---------|------|-------------|---------|
| `log_level` | string | Log verbosity | `info` |
| `output_format` | string | CLI output format | `text` |

### Path Settings

| Setting | Type | Description |
|---------|------|-------------|
| `project_path` | string | Override project path |
| `config_path` | string | Override config path |

## Configuration Hierarchy

Settings are resolved in priority order:

1. **Environment variables** (`NERV_*`)
2. **Project config** (`.nerv/config.json`)
3. **Organization config** (via org sync)
4. **Global config** (`~/.nerv/config.json`)
5. **Default values**

## Environment Variables

Any setting can be overridden via environment:

```bash
# Format: NERV_<SETTING_NAME_UPPERCASE>
NERV_MONTHLY_BUDGET_USD=100 nerv start
NERV_LOG_LEVEL=debug nerv yolo
NERV_DEFAULT_MODEL=claude-opus nerv benchmark specs/test.md
```
