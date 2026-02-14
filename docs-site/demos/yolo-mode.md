# YOLO Mode

Fully autonomous development from a spec file. NERV configures the build loop, launches Claude, and tracks cycles, cost, and test results in real time.

## 1. Configure Tab

Open the YOLO panel from the **More** menu. The Configure tab lets you set up benchmark parameters.

![Configure Empty](/screenshots/demos/yolo-mode/01-configure-empty.png)

## 2. Fill in Settings

Set the **spec file** (e.g., `SPEC.md`), **test command** (e.g., `npm test`), and **max cycles**. NERV handles the rest.

![Configure Filled](/screenshots/demos/yolo-mode/02-configure-filled.png)

## 3. Save Configuration

Click **"Save Configuration"** to store your benchmark settings. Saved configs appear in the list for quick re-runs.

![Config Saved](/screenshots/demos/yolo-mode/03-config-saved.png)

## 4. Running

After starting the benchmark, the **Running** tab shows live progress — cycles completed, tasks created, cost spent, and elapsed time.

![Running](/screenshots/demos/yolo-mode/04-running.png)

## 5. Results

When the benchmark completes, the **Results** tab shows final metrics including spec completion rate and test pass rate.

![Results](/screenshots/demos/yolo-mode/05-results.png)

## 6. Board After Benchmark

Back on the kanban board, you can see all the tasks that were created and completed during the autonomous run.

![Board After](/screenshots/demos/yolo-mode/06-board-after.png)
