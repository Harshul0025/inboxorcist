import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createApiClient } from './lib/api';
import { createAppCheckTokenGetter } from './lib/firebaseApp';
import './index.css';

const config = await createApiClient().config();
const getAppCheckToken = createAppCheckTokenGetter(config);
const api = createApiClient(getAppCheckToken ? { getAppCheckToken } : {});

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');

createRoot(root).render(
  <StrictMode>
    <App services={{ api, config }} />
  </StrictMode>,
);
