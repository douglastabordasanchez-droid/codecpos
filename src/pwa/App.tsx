import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { PwaAuthProvider } from './contexts/PwaAuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { router } from './routes';

export default function App() {
  return (
    <ThemeProvider>
      <PwaAuthProvider>
        <RouterProvider router={router} />
        <Toaster position="top-center" richColors />
      </PwaAuthProvider>
    </ThemeProvider>
  );
}
