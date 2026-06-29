export function cleanProcessEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.npm_config_prefix;
  delete env.NPM_CONFIG_PREFIX;
  return env;
}
