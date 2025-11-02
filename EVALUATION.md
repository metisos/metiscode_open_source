# CLI Agent Evaluation

## Test Execution Summary

Command: `npm test -- --run`

### Overall Results
- Total test files: 11
- Passed: 4
- Failed: 7
- Total individual tests: 122
- Passed: 108
- Failed: 14

### Failing Areas
1. **Background Process Management**
   - Status tracking when killing processes reports `failed` instead of `killed`.
   - Cleanup routine ignores explicit age thresholds (e.g., `cleanup(0)` returns 0).
   - Regex filtering on captured output returns no matches even when data contains the expected substring.

2. **Hooks System**
   - JSON output from hook commands is not parsed back into `modifiedParams`.
   - Modified parameters do not flow through chained hooks.

3. **Token Budget Manager**
   - `canAfford` rejects requests that exactly fill the remaining budget (expected to allow 2000 additional tokens when 8000 have been used).

4. **Persona Asset Loader**
   - Workspace overrides in `.metis` are not detected, causing persona discovery, validation, and creation to fail.

5. **File Tools**
   - `read_file` tool outputs line-number prefixes (`1→`) that conflict with tests expecting raw file content.

6. **Error Formatting**
   - `MetisError.toUserFriendlyString()` omits the expected `❌` prefix and “Suggestions” block.

7. **End-to-End Workflow Tests**
   - Mocha-style `.timeout()` calls are incompatible with Vitest’s test API.

### Reference Output
See the detailed Vitest report for complete stack traces and failure context.【6130f3†L1-L167】

## Recommendations
- Align the CLI runtime with test expectations (status transitions, persona directory discovery, token budgeting semantics).
- Update hook execution to parse JSON payloads and propagate mutations across chains.
- Harmonize tool output formatting with both unit tests and CLI UX (e.g., optional line-number rendering).
- Provide Vitest-compatible timeout handling in end-to-end tests.

