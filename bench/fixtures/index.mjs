export { prelude } from './schemas.mjs';
import { profiles as schemas } from './schemas.mjs';
import { profiles as cli } from './cli.mjs';
import { profiles as forms } from './forms.mjs';

export const profiles = [...schemas, ...cli, ...forms];
