/**
 * Host companion for the SDD document viewer.
 *
 * All behavior lives in the browser half (`client.js`). This entry exists so the
 * package loads as a complete Host+Client dynamic plugin: it reads no files,
 * registers no services, starts no subprocesses, and touches no model or
 * credential state.
 * @returns {void}
 */
export function apply() {}
