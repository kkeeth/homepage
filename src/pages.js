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
    path: '/podcast',
    label: 'PODCAST',
    componentName: 'podcast',
  },
  {
    path: '/about',
    label: 'ABOUT',
    componentName: 'about',
  },
  {
    path: '/contact',
    label: 'CONTACT',
    componentName: 'contact',
  },
  {
    path: '/privacy',
    label: 'PRIVACY',
    componentName: 'privacy',
    hidden: true,
  },
];
