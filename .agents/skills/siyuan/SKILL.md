```markdown
# siyuan Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill teaches you the development patterns and workflows used in the `siyuan` repository, a Go-based project with a focus on extensible features such as AI semantic search, multilingual documentation, CLI commands, and robust backend logic. You'll learn the coding conventions, file organization, and step-by-step workflows for contributing new features, fixing bugs, and maintaining code quality in this codebase.

---

## Coding Conventions

### File Naming

- **CamelCase** is used for file names.
  - Example: `embedding.go`, `aiTab.ts`, `virtualScroll.ts`

### Import Style

- **Relative imports** are preferred.
  - Example in Go:
    ```go
    import "../model"
    ```

### Export Style

- **Named exports** are used, especially in TypeScript.
  - Example:
    ```typescript
    export function renderCell() { ... }
    ```

### Commit Patterns

- Freeform commit messages, typically around 80 characters.
- No enforced prefix (e.g., "fix:", "feat:"), but messages are descriptive.

---

## Workflows

### Feature Development: AI Semantic Search

**Trigger:** When you want to add or extend AI/semantic search functionality.  
**Command:** `/add-ai-feature`

1. Implement backend logic in Go for embeddings and AI search.
   ```go
   // kernel/model/embedding.go
   func GenerateEmbedding(text string) []float64 { ... }
   ```
2. Update or create API endpoints for AI features.
   ```go
   // kernel/api/ai.go
   func HandleAISearch(w http.ResponseWriter, r *http.Request) { ... }
   ```
3. Add or update UI config files for AI tabs.
   ```typescript
   // app/src/config/tabs/aiTab.ts
   export const aiTabConfig = { ... };
   ```
4. Update localization files for new UI elements.
   ```json
   // app/appearance/langs/en.json
   {
     "ai_search": "AI Semantic Search"
   }
   ```
5. Modify or add SCSS for related UI components.
   ```scss
   // app/src/assets/scss/business/_config.scss
   .ai-tab { ... }
   ```

---

### Documentation Update: Multilingual

**Trigger:** When you want to update or add documentation in multiple languages.  
**Command:** `/update-docs-multilingual`

1. Edit or add documentation files for each supported language.
   - Example: `README.md`, `README.zh-CN.md`, `README.ja.md`, etc.
2. Update the main README and related docs.
3. Commit all language variants together.

---

### Bugfix: Database Table UI

**Trigger:** When you want to fix a bug in the database table UI (filtering, scrolling, field issues).  
**Command:** `/fix-db-table-ui-bug`

1. Identify and fix the bug in the relevant UI TypeScript files.
   ```typescript
   // app/src/protyle/render/av/cell.ts
   export function updateCellValue(...) { ... }
   ```
2. Update or add related files for table actions, filters, or rendering.
3. Commit all related UI files together.

---

### Feature: Add CLI Command

**Trigger:** When you want to add a new CLI command.  
**Command:** `/add-cli-command`

1. Implement the new CLI command in Go.
   ```go
   // kernel/cli/cmd/newcommand.go
   func NewCommand() { ... }
   ```
2. Update or add related guide files for the new command.
   - Example: `app/guide/cli/newcommand.sy`
3. Commit both code and guide updates together.

---

### Test-Driven: Backend Feature

**Trigger:** When you want to add or fix a backend feature with tests.  
**Command:** `/add-backend-feature-with-test`

1. Implement or fix backend logic in Go.
   ```go
   // kernel/agent/feature.go
   func NewFeature() { ... }
   ```
2. Add or update corresponding `*_test.go` files.
   ```go
   // kernel/agent/feature_test.go
   func TestNewFeature(t *testing.T) { ... }
   ```
3. Commit both implementation and tests together.

---

## Testing Patterns

- **Testing Framework:** Not explicitly specified; standard Go testing is used.
- **Test File Pattern:** Files are named with the `_test.go` suffix.
  - Example: `feature_test.go`
- **Test Example:**
  ```go
  import "testing"

  func TestFunctionality(t *testing.T) {
      result := Functionality()
      if result != expected {
          t.Errorf("Expected %v, got %v", expected, result)
      }
  }
  ```

---

## Commands

| Command                        | Purpose                                                        |
|--------------------------------|----------------------------------------------------------------|
| /add-ai-feature                | Add or extend AI/semantic search functionality                 |
| /update-docs-multilingual      | Update documentation in multiple languages                     |
| /fix-db-table-ui-bug           | Fix bugs in the database table UI (filtering, scrolling, etc.) |
| /add-cli-command               | Add a new CLI command and update guides                        |
| /add-backend-feature-with-test | Add or fix a backend feature with corresponding tests          |
```
