## Data Matches for StashResults (Tampermonkey userscript)

**File**: `stash-DataMatchHighlighter.js`  
**Target**: Stash UI search/tagger results at `*://localhost:9999/scenes*` and `*://localhost:9999/groups*`  
**Author**: KennyG

### What this script does

- **Highlights filename / metadata agreement in Stash search results** to make good matches pop visually:
  - **Date fields (ISO `YYYY-MM-DD`)** inside each result card:
    - When the date is found in the filename/title in a strict pattern (e.g. `2021-08-05`, `21.08.05`, `210805`), the field gets a **green circle-check icon** with tooltip **“Exact date match in filename”** and no background highlight.
    - When all 3 components (YY, MM, DD) are present but not in an exact pattern, the field is **teal‑highlighted** to show a strong but not perfect match.
  - **Other optional fields** (`.optional-field-content`):
    - If the field’s text is fully contained in the scene title, it is fully **teal‑highlighted** with white text.
    - Otherwise a **fuzzy match** is computed vs. the title; the background opacity scales with match percentage (more overlap → stronger color).
  - **Entities (Studio / Performer rows in `.entity-name`)**:
    - Text is normalized (lowercase, apostrophes stripped, optional parentheses removed, spaces vs dots handled) and compared against the filename/title.
    - On a successful match, a **green circle-check icon** is appended with tooltip like **“Studio found in filename”** or **“Performer found in filename”**.
  - **Fingerprint summary line** (`X / Y fingerprints` inside `div.font-weight-bold`):
    - Appends the **percentage match** (e.g. ` (93%)`).
    - Colors the background from **red → orange → citron → teal** based on both total fingerprints and match ratio, with white text for readability.

- Uses a **MutationObserver** plus a `window.load` hook so highlights update automatically as Stash updates the DOM (e.g. when new results load, or the tagger UI changes).

### Installation

- Install [Tampermonkey](https://www.tampermonkey.net/) (or a compatible userscript manager) in your browser.
- Create a new userscript and paste the contents of `stash-DataMatchHighlighter.js`, or install it directly from this repository’s **raw** file URL.
- Ensure the `@match` lines in the header match your Stash URL. For a default local setup this script uses:
  - `*://localhost:9999/scenes*`
  - `*://localhost:9999/groups*`

### Notes

- The script is read‑only: it only adjusts **styling and tooltips**, never modifying data in Stash or StashBox.
- If you change your Stash base URL, update the `@match` patterns accordingly or generalize them (e.g. `*://*/scenes*`, `*://*/groups*`) before publishing. 


## Performer Match Hover Overlay (Tampermonkey userscript)

**File**: `Stash-PerformerMatchPopOver.js`  
**Target**: Stash scene tagging UI performer selector at `*://localhost:9999/scenes*`  
**Author**: KennyG

### What this script does

- **Adds a hover overlay for the performer dropdown** on the scene tagging page:
  - When you hover the performer select, after a short delay an overlay appears near the control.
  - The overlay shows **matching performers** from your Stash instance using the same styling as native performer cards (image, name, disambiguation, country, age, counts, gender icon, etc.).
- **Uses Stash’s GraphQL API** to search for potential performer matches based on the currently selected performer name.
- **Displays quick‑access actions**:
  - Performer cards are clickable (and middle‑clickable) to open the full performer page in a new tab.
  - Count buttons show scene/group/tag counts and O‑counter, matching Stash’s UI patterns.

### Installation

- Install [Tampermonkey](https://www.tampermonkey.net/) (or a compatible userscript manager) in your browser.
- Create a new userscript and paste the contents of `Stash-PerformerMatchPopOver.js`, or install it directly from this repository’s **raw** file URL.
- Ensure the `@match` line in the header matches your Stash URL. For a default local setup this script uses:
  - `*://localhost:9999/scenes*`
  - You can generalize it (e.g. `*://*/scenes*`) if you run Stash on a different host.

### Notes

- The script is read‑only: it only performs **GraphQL queries and DOM rendering**, never modifying data in Stash or StashBox.
- If you change your Stash base URL, update the `@match` pattern accordingly before publishing or sharing the script.

