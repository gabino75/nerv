<script lang="ts">
  /**
   * CompleteCycleModal - Modal for completing a cycle with learnings
   */

  import { Modal, FormGroup, Button } from '../shared'

  interface Props {
    isOpen: boolean
    cycleNumber: number | null
    onClose: () => void
    onComplete: (learnings: string) => void
    isLoading?: boolean
  }

  let { isOpen, cycleNumber, onClose, onComplete, isLoading = false }: Props = $props()

  let learnings = $state('')

  function handleComplete() {
    onComplete(learnings)
    learnings = ''
  }

  function handleClose() {
    learnings = ''
    onClose()
  }
</script>

<Modal
  {isOpen}
  onClose={handleClose}
  title="Complete Cycle {cycleNumber ?? ''}"
  hint="These learnings will inform future cycles and be included in context for Claude."
>
  <FormGroup label="What did you learn?" id="learnings">
    <textarea
      id="learnings"
      data-testid="learnings-input"
      bind:value={learnings}
      placeholder="- What worked well?&#10;- What didn't work?&#10;- What surprised you?&#10;- What would you do differently?"
      rows="6"
    ></textarea>
  </FormGroup>

  {#snippet actions()}
    <Button variant="secondary" onclick={handleClose}>Cancel</Button>
    <Button variant="primary" onclick={handleComplete} disabled={isLoading}>
      <span data-testid="confirm-complete-cycle-btn">Complete Cycle</span>
    </Button>
  {/snippet}
</Modal>
