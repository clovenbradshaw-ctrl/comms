# Workspace View Interface

The `WorkspaceView` class renders the admin-style workspace surface used by the prototype screen in `screens/workspaceView.html`. It accepts a workspace record plus optional callbacks and subpage definitions, then draws a three-column layout with contextual actions for the selected workspace.【F:lib/workspace-view.js†L25-L108】

## Layout regions

- **Header.** Shows the workspace title, description, and key metadata such as visibility, join rule, and creation date. The right side of the header carries the invite code, a copy-link button, and a "Back to Workspaces" action.【F:lib/workspace-view.js†L64-L229】
- **Left sidebar.** Lists channels under a "Channels" heading, rendering the creation date for each and exposing a "+ Add Channel" button tied to the `onChannelCreate` callback.【F:lib/workspace-view.js†L78-L161】【F:lib/workspace-view.js†L231-L242】
- **Main content area.** Hosts a pill-style sub-navigation bar and the currently selected subpage content. Subpages are rendered into a dedicated container so they can supply rich markup or DOM nodes.【F:lib/workspace-view.js†L84-L335】
- **Right sidebar.** Displays members with generated avatars, role labels, and a dynamic header that reflects the member count.【F:lib/workspace-view.js†L88-L258】

The accompanying styles give the layout its three-column grid, soft translucent cards, and responsive behavior that collapses to a single column at narrower widths.【F:styles.css†L4731-L4990】

## Data binding and updates

`updateWorkspace` repaints each region using the latest workspace record. It normalizes metadata (e.g., mapping `joinRules` and `type` into human-friendly strings) and re-renders channels and members lists, falling back to placeholder list items when data is missing.【F:lib/workspace-view.js†L199-L263】 Calling `updateWorkspace` is idempotent, so interactions such as channel creation or member edits can safely clone a workspace object and hand it back to the view.

## Subpages framework

Every instance registers a built-in **Overview** subpage and can accept more through the `subpages` option. Each subpage entry can supply a label, optional badge, and render function that receives the active workspace. Navigation buttons are generated automatically with ARIA roles and selection state, and clicking one both switches the subpage and fires the `onSubpageChange` callback.【F:lib/workspace-view.js†L50-L335】 The default overview card greets users in the first channel and nudges them to share the invite code.【F:lib/workspace-view.js†L337-L347】

## User interactions and callbacks

The view exposes high-level hooks for host actions:

- `onLeave` runs when the back button is clicked, letting the shell route away from the view.【F:lib/workspace-view.js†L111-L114】
- `onCopyLink` supports async copy flows. When it resolves truthy the button briefly shows "Link Copied!", while failures fall back to an alert using the stored `fallbackLink`.【F:lib/workspace-view.js†L116-L187】
- `onChannelCreate` prompts for a channel name, passes it to the callback, and refreshes the layout once the promise resolves (or immediately for sync handlers).【F:lib/workspace-view.js†L138-L162】

Prototype data in `screens/workspaceView.js` demonstrates these hooks in action. It seeds demo workspaces, injects two custom subpages (Activity metrics and Visualizations ideas), and wires buttons to clone-and-update the active workspace when members or channels are added.【F:screens/workspaceView.js†L11-L200】

## Visual system notes

Component-specific styles rely on translucent surfaces, pill-shaped controls, and gradients to set the workspace view apart from the base app. Highlights include:

- `.workspace-ui__subnav` and `.workspace-ui__subnavItem` provide the horizontal tab strip with hover and selected states.【F:styles.css†L4814-L4846】
- `.workspace-ui__panel`, `.workspace-ui__metricGrid`, and related classes define card-style panels used by custom subpages.【F:styles.css†L4860-L4919】
- `.workspace-ui__members` styles avatars and metadata in the members sidebar, while `.workspace-ui__empty` offers a neutral empty state for subpages that render nothing yet.【F:styles.css†L4770-L4962】【F:styles.css†L4940-L4946】

