export const TERMINAL_ENV_UNSET_KEYS = [
  "CI",
  "NO_COLOR",
  "CODEX_CI",
  "CODEX_INTERNAL_ORIGINATOR_OVERRIDE",
  "CODEX_SANDBOX",
  "CODEX_SANDBOX_NETWORK_DISABLED",
  "CODEX_SHELL",
  "CODEX_THREAD_ID"
];

export function cleanProcessEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.npm_config_prefix;
  delete env.NPM_CONFIG_PREFIX;
  for (const key of TERMINAL_ENV_UNSET_KEYS) delete env[key];
  env.LANG ||= "en_US.UTF-8";
  env.LC_CTYPE ||= env.LANG;
  return env;
}

export function colorProcessEnv(): NodeJS.ProcessEnv {
  return {
    ...cleanProcessEnv(),
    CLICOLOR: "1",
    COLORTERM: "truecolor",
    FORCE_COLOR: "3"
  };
}
