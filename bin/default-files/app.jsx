// src/app.jsx 
import React, { useState } from 'react';

export async function getServerSideProps(context) {
  const pageTitle = "Welcome | My App"; // could come from DB or API
  return {
    props: { title: pageTitle }, // passed as props to the component
  };
}


const App = () => {
  const [count, setCount] = useState(0);
  return (
    <main>
      <h1>App</h1>
      <p>Hello SSR + Vite!</p>
      <div>
        <div>{count}</div>
        <button onClick={() => setCount(count + 1)}>Increment</button>
      </div>
    </main>
  );
};

export default App;
