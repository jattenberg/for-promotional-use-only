import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { NOT_FOUND_DOCUMENT_TITLE, setDocumentCanonical } from './documentTitle';

export default function NotFound() {
  const location = useLocation();

  useEffect(() => {
    document.title = NOT_FOUND_DOCUMENT_TITLE;
    setDocumentCanonical(location.pathname);
  }, [location.pathname]);

  return (
    <div className="container">
      <h2>not found, sorry.</h2>
    </div>
  );
}
