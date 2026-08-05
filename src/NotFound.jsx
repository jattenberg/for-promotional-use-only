import { useEffect } from 'react';
import { NOT_FOUND_DOCUMENT_TITLE } from './documentTitle';

export default function NotFound() {
  useEffect(() => {
    document.title = NOT_FOUND_DOCUMENT_TITLE;
  }, []);

  return (
    <div className="container">
      <h2>not found, sorry.</h2>
    </div>
  );
}
