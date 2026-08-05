import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import App from './App';
import NotFound from './NotFound';

const Router = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Navigate to="/k" replace />} />
      <Route path="/:letter" element={<App />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </BrowserRouter>
);

export default Router;
