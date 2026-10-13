export { libraries, imports, prelude } from '../coverage/fixtures.mjs';
import { profiles as canonical } from '../coverage/fixtures.mjs';
import { profiles as cli } from '../cli/fixtures.mjs';
import { profiles as forms } from '../optimization-3/supplement-fixtures.mjs';
export const profiles = [...canonical, ...cli, ...forms];
export const coverage = { singleUse: profiles.map(profile => profile.id) };
