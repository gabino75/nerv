import type { TaskReview } from '../../shared/types'
import type Database from 'better-sqlite3'

/**
 * Task review database operations for review gate before merge (PRD Section 2)
 */
export class ReviewOperations {
  constructor(
    private getDb: () => Database.Database,
    private generateId: () => string,
    private logAuditEvent: (taskId: string | null, eventType: string, details: string | null) => void
  ) {}

  /**
   * Get the review for a task
   */
  getReviewForTask(taskId: string): TaskReview | undefined {
    return this.getDb().prepare(
      'SELECT * FROM task_reviews WHERE task_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(taskId) as TaskReview | undefined
  }

  /**
   * Get all pending reviews
   */
  getPendingReviews(): TaskReview[] {
    return this.getDb().prepare(
      "SELECT * FROM task_reviews WHERE status = 'pending' ORDER BY created_at ASC"
    ).all() as TaskReview[]
  }

  /**
   * Create a review request when task enters 'review' status
   */
  createReview(taskId: string): TaskReview {
    const id = this.generateId()
    this.getDb().prepare(
      'INSERT INTO task_reviews (id, task_id, status) VALUES (?, ?, ?)'
    ).run(id, taskId, 'pending')

    this.logAuditEvent(taskId, 'review_requested', JSON.stringify({ reviewId: id }))
    return this.getDb().prepare('SELECT * FROM task_reviews WHERE id = ?').get(id) as TaskReview
  }

  /**
   * Approve a review - task can be merged/marked done
   */
  approveReview(taskId: string, notes?: string): TaskReview | undefined {
    const review = this.getReviewForTask(taskId)
    if (!review || review.status !== 'pending') return undefined

    const decidedAt = new Date().toISOString()
    this.getDb().prepare(
      'UPDATE task_reviews SET status = ?, reviewer_notes = ?, decided_at = ? WHERE id = ?'
    ).run('approved', notes || null, decidedAt, review.id)

    this.logAuditEvent(taskId, 'review_approved', JSON.stringify({ reviewId: review.id, notes }))
    return this.getDb().prepare('SELECT * FROM task_reviews WHERE id = ?').get(review.id) as TaskReview
  }

  /**
   * Store Claude's summary on a review record for persistence across restarts
   */
  setClaudeSummary(taskId: string, summary: string): void {
    const review = this.getReviewForTask(taskId)
    if (review) {
      this.getDb().prepare(
        'UPDATE task_reviews SET claude_summary = ? WHERE id = ?'
      ).run(summary, review.id)
    }
  }

  /**
   * Reject a review - task needs more work
   */
  rejectReview(taskId: string, notes: string): TaskReview | undefined {
    const review = this.getReviewForTask(taskId)
    if (!review || review.status !== 'pending') return undefined

    const decidedAt = new Date().toISOString()
    this.getDb().prepare(
      'UPDATE task_reviews SET status = ?, reviewer_notes = ?, decided_at = ? WHERE id = ?'
    ).run('rejected', notes, decidedAt, review.id)

    this.logAuditEvent(taskId, 'review_rejected', JSON.stringify({ reviewId: review.id, notes }))
    return this.getDb().prepare('SELECT * FROM task_reviews WHERE id = ?').get(review.id) as TaskReview
  }
}
