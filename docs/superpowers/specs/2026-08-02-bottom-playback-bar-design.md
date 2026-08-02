# Bottom Playback Bar Design

## Goal

Move transport controls out of individual playlist rows into an always-visible bottom playback bar
while preserving row-level favorite and download actions. The active track should remain obvious as
automatic playback advances through the playlist.

## User Experience

The bottom playback bar is fixed to the viewport and is always visible. Before a track is selected,
it displays an idle state. Once a track is loaded, it shows:

- current track title;
- previous, play/pause, and next controls;
- a seekable progress bar;
- elapsed and total time;
- an equalizer indicator;
- favorite and download actions.

The existing star button remains the independent trigger for the Favorites and Recently Played
drawer.

## Playlist Rows

Selecting a row loads and starts that track in the bottom bar. The selected row remains highlighted
and displays a play indicator. The equalizer appears only in the bottom bar.

The active row retains its favorite and download actions beneath the title, but it no longer renders
transport controls or a progress bar. When playback advances, the active highlight and play
indicator move to the next sorted playlist row.

## Architecture

`App` owns the current track and playback request state so playback survives letter-route changes.
It renders a single bottom playback component outside the song list. `Songs` becomes a declarative
playlist view: it receives the current path and reports track selections and previous/next
navigation requests.

The bottom component owns the audio element integration, media events, seek application, and
position flushing. Existing persistence behavior remains in `App`: plays update Recently Played,
positions are periodically saved, and drawer selections may resume from a saved offset.

The currently loaded letter's sorted song list determines previous and next tracks. Reaching the end
of that list clears playback unless a later catalog-wide continuation behavior is designed.

## Layout and Responsive Behavior

The bar spans the viewport bottom and uses the existing player colors and typography. The page gains
bottom padding equal to the bar height so the final playlist rows remain reachable.

On narrow screens, controls may wrap or compress, but the track title, play/pause control, progress,
and time remain usable. The drawer continues to open independently over page content.

## Error and Edge Behavior

- An idle bar is shown when no track is loaded.
- A failed media load leaves the track selected and exposes the audio element's non-playing state;
  no automatic skip is introduced.
- Previous on the first track and next on the final track clear playback, matching current behavior.
- Selecting the active row does not hide the player; it keeps that track loaded.
- Cross-letter drawer playback navigates to the target letter and starts after its song list loads.

## Verification

Component tests will cover:

- idle and loaded bottom-bar states;
- selecting a playlist row;
- active-row highlight and play indicator;
- absence of inline transport controls;
- previous/next and ended-track progression;
- favorite and download actions in both the active row and bottom bar;
- resume-seek and playback-position callbacks.

The existing utility tests and production build must continue to pass. Manual verification will
cover responsive layout, fixed-bar overlap, real media controls, and drawer playback.
