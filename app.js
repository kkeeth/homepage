import '@riotjs/hot-reload';
import { component } from 'riot';
import '@shoelace-style/shoelace/dist/themes/light.css';
import { setBasePath } from '@shoelace-style/shoelace/dist/utilities/base-path';
setBasePath(
  'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.12.0/cdn/',
);

import './src/style.css';
import App from './src/app.riot';
import registerGlobalComponents from './src/register-global-components';

// register
registerGlobalComponents();

component(App)(document.getElementById('root'));
