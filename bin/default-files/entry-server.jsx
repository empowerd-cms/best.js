// src/entry-server.jsx
import { renderToString } from 'react-dom/server';

export async function render(page) {
  // Dynamically import the page component
  try {
    const mod = await import(`./pages/${page}.jsx`);
    const Page = mod.default;
    return renderToString(<Page />);
  } catch (err) {
    // Fallback if page not found
    const fallback = await import('./app.jsx');
    const Fallback = fallback.default;
    return renderToString(<Fallback />);
  }
}

