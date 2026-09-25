import { BrowserRouter } from 'react-router-dom';
import { Layout } from './shell/Layout';

export function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}
