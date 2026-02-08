<script lang="ts">
  /**
   * DecisionModal - Modal for recording a decision (ADR)
   */

  import { Modal, FormGroup, Button } from '../shared'

  interface Props {
    isOpen: boolean
    onClose: () => void
    onCreate: (title: string, rationale: string, alternatives: string) => void
    isLoading?: boolean
  }

  let { isOpen, onClose, onCreate, isLoading = false }: Props = $props()

  let title = $state('')
  let rationale = $state('')
  let alternatives = $state('')

  function handleCreate() {
    onCreate(title, rationale, alternatives)
    title = ''
    rationale = ''
    alternatives = ''
  }

  function handleClose() {
    title = ''
    rationale = ''
    alternatives = ''
    onClose()
  }
</script>

<Modal
  {isOpen}
  onClose={handleClose}
  title="Record Decision (ADR)"
>
  <FormGroup label="Decision Title" id="decision-title">
    <input
      id="decision-title"
      data-testid="decision-title-input"
      type="text"
      bind:value={title}
      placeholder="e.g., Use Auth0 over Okta for authentication"
    />
  </FormGroup>
  <FormGroup label="Rationale" id="decision-rationale">
    <textarea
      id="decision-rationale"
      data-testid="decision-rationale-input"
      bind:value={rationale}
      placeholder="Why did you make this decision? What factors influenced it?"
      rows="3"
    ></textarea>
  </FormGroup>
  <FormGroup label="Alternatives Considered" id="decision-alternatives">
    <textarea
      id="decision-alternatives"
      bind:value={alternatives}
      placeholder="What other options did you consider and why were they rejected?"
      rows="2"
    ></textarea>
  </FormGroup>

  {#snippet actions()}
    <Button variant="secondary" onclick={handleClose}>Cancel</Button>
    <Button variant="primary" onclick={handleCreate} disabled={!title.trim() || isLoading} testId="save-decision-btn">
      Save Decision
    </Button>
  {/snippet}
</Modal>
