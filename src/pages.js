export default [
  {
    path: '/',
    label: 'HOME',
    componentName: 'home',
  },
  {
    path: '/episodes',
    label: 'EPISODES',
    componentName: 'episodes',
  },
  {
    path: '/episodes/:id',
    label: 'EPISODE',
    componentName: 'episode-detail',
    hidden: true,
  },
  {
    path: '/info',
    label: 'INFO',
    componentName: 'info',
  },
  {
    path: '/profile',
    label: 'PROFILE',
    componentName: 'profile',
  },
  {
    path: '/contact',
    label: 'CONTACT',
    componentName: 'contact',
  },
  {
    path: '/login',
    label: 'LOGIN',
    componentName: 'login',
    hidden: true,
  },
  {
    path: '/account',
    label: 'ACCOUNT',
    componentName: 'account',
    hidden: true,
  },
  {
    path: '/terms',
    label: 'TERMS',
    componentName: 'terms',
    hidden: true,
  },
  {
    path: '/privacy',
    label: 'PRIVACY',
    componentName: 'privacy',
    hidden: true,
  },
  {
    path: '/tokushoho',
    label: 'TOKUSHOHO',
    componentName: 'tokushoho',
    hidden: true,
  },
];
