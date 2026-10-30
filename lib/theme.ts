/** The light / dark choice, kept only in this browser's localStorage (dark is the default). */
export const THEME_KEY = "crux.theme";

/**
 * Runs before first paint (app/layout.tsx): applies the saved theme so a light-mode page never flashes black. A plain
 * module, not the client component, so the server layout gets the string itself.
 */
export const THEME_SCRIPT = `try{if(localStorage.getItem("${THEME_KEY}")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;
