---
name: documentation
description: Update docs for code changes
allowed-tools: [Read, Write, Edit, Grep, Glob]
---

# Documentation Workflow

Update documentation to reflect code changes. Ensure all user-facing features are documented and API changes are recorded.

## Acceptance Criteria
- [ ] README updated if user-facing features changed
- [ ] API documentation updated for endpoint changes
- [ ] Code comments added for complex logic
- [ ] CHANGELOG updated with notable changes
- [ ] Migration guide written if breaking changes

## Steps
1. Identify what code changed (read git diff or task description)
2. Determine documentation impact:
   - New features need user docs
   - API changes need API docs
   - Breaking changes need migration guide
3. Update relevant documentation files
4. Add inline code comments where logic is complex
5. Update CHANGELOG.md if not already done
6. Verify all links and references are valid

## Documentation Types

### User Documentation
- README.md - Quick start, installation
- docs/USER-GUIDE.md - Comprehensive usage

### API Documentation
- docs/API-REFERENCE.md - Endpoint specs
- OpenAPI/Swagger if applicable

### Developer Documentation
- DEVELOPERS.md - Setup, architecture
- CLAUDE.md - Codebase conventions

## Best Practices
- Use clear, concise language
- Include code examples
- Keep docs close to code when possible
- Test all documented commands
