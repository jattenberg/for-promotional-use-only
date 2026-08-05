import { createRoot } from 'react-dom/client';
import Router from './Router';
import './static/stylus/App.styl';

const root = createRoot(document.getElementById('root'));
root.render(<Router />);
