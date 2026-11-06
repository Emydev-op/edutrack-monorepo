// Conventional Commits are required: release-please derives versions and changelogs from them.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      [
        'backend',
        'platform-backoffice',
        'school-admin',
        'teacher-portal',
        'student-portal',
        'parent-portal',
        'ui',
        'shared',
        'web-core',
        'app-kit',
        'infra',
        'ci',
        'deps',
        'repo',
      ],
    ],
  },
};
