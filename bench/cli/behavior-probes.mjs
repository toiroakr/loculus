export const behaviorProbes = {
  'git log': {
    valid: [
      [{ since: '2 weeks ago', format: '' }, { since: '2 weeks ago', format: '' }],
      [{ encoding: 'UTF-8', unknown: 'strip' }, { encoding: 'UTF-8' }],
    ],
    invalid: [[{ format: ['%h', '%s'] }, 'format'], [{ date: null }, 'date']],
  },
  'git clone': {
    valid: [
      [{ repository: 'repo', depth: '+1', jobs: '4', singleBranch: '0', shallowExclude: 'archive' }, { repository: 'repo', depth: 1, jobs: 4, singleBranch: false, shallowExclude: ['archive'] }],
      [{ repository: 'repo', noCheckout: 'true', quiet: 'false' }, { repository: 'repo', noCheckout: true, quiet: false }],
    ],
    invalid: [[{ repository: 'repo', depth: '0' }, 'depth'], [{ repository: 'repo', jobs: 'many' }, 'jobs'], [{ repository: 'repo', depth: '1.5' }, 'depth'], [{}, 'repository']],
  },
  'cf deploy': {
    valid: [
      [{ mode: 'staging', prebuilt: '1', provision: '0', containersRollout: 'gradual' }, { mode: 'staging', prebuilt: true, provision: false, containersRollout: 'gradual', dryRun: false }],
      [{ message: '', secretsFile: 'secrets.env', dryRun: 'true' }, { message: '', secretsFile: 'secrets.env', dryRun: true, prebuilt: false, provision: true }],
    ],
    invalid: [[{ dryRun: 'yes' }, 'dryRun'], [{ provision: null }, 'provision'], [{ containersRollout: 'fast' }, 'containersRollout']],
  },
  'cf dns records list': {
    valid: [
      [{ zone: 'example.com', type: 'AAAA', page: '2', perPage: '100', proxied: 'false' }, { zone: 'example.com', type: 'AAAA', page: 2, perPage: 100, proxied: false, dryRun: false }],
      [{ commentPresent: '', tagPresent: 'owner', includeShadowMetadata: '1', direction: 'desc', page: '1.5' }, { commentPresent: '', tagPresent: 'owner', includeShadowMetadata: true, direction: 'desc', page: 1.5, dryRun: false }],
    ],
    invalid: [[{ type: 'IPv4' }, 'type'], [{ order: 'size' }, 'order'], [{ perPage: '' }, 'perPage'], [{ page: 'many' }, 'page'], [{ proxied: 'yes' }, 'proxied']],
  },
};
