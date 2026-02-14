# Code Review

Human-in-the-loop review for AI-generated code changes. Every task completed by Claude enters the Review column for human approval before merging.

## 1. Task in Review

When Claude finishes a task, it moves to the **Review** column on the kanban board.

![Task in Review](/screenshots/demos/code-review/01-task-in-review.png)

## 2. Review Modal

Click the task card to open the review modal. You'll see the task title, description, and review controls.

![Review Modal](/screenshots/demos/code-review/02-review-modal.png)

## 3. Code Diff

Expand the diff to see exactly what Claude changed — new files, modified lines, and deletions.

![Diff Expanded](/screenshots/demos/code-review/03-diff-expanded.png)

## 4. Claude's Summary

Claude provides a summary explaining what it did and why, giving context for the code changes.

![Claude Summary](/screenshots/demos/code-review/04-claude-summary.png)

## 5. Write Feedback

Type feedback in the review notes field to tell Claude what to improve.

![Review Feedback](/screenshots/demos/code-review/05-review-feedback.png)

## 6. Request Changes

Click **"Request Changes"** to send the task back to Claude with your feedback. The task returns to in-progress.

![Changes Requested](/screenshots/demos/code-review/06-changes-requested.png)

## 7. Resubmitted for Review

Claude addresses the feedback and resubmits the task for review. The cycle repeats until you're satisfied.

![Resubmitted](/screenshots/demos/code-review/07-resubmitted.png)

## 8. Approve & Complete

When the code looks good, click **"Approve & Complete"**. The task moves to Done and code merges automatically.

![Approved Done](/screenshots/demos/code-review/08-approved-done.png)
