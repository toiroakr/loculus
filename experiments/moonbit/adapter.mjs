export function createSchema(core, config) {
  const plan = core.compile_schema(config);
  return { '~standard': { version: 1, vendor: 'loculus-moonbit-experiment', validate: input => core.validate(plan, input) } };
}
