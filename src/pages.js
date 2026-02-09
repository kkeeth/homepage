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
];
