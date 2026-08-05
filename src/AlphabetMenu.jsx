import { Link } from 'react-router-dom';
import { letterToRoute } from './songUtils';

const alphabetConst = 'abcdefghijklmnopqrstuvwxyz'.toUpperCase().split('');

export default function AlphabetMenu({ activeLetter }) {
  const createLetter = (letter, label = letter) => {
    const isActive = activeLetter === letter;
    const className = [
      'alphabet-letter',
      isActive ? 'active-letter' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <li key={letter}>
        <Link
          className={className}
          to={'/' + letterToRoute(letter)}
          aria-current={isActive ? 'page' : undefined}
          aria-label={letter === 'NUM' ? 'Numbers and symbols' : undefined}
        >
          {label}
        </Link>
      </li>
    );
  };

  return (
    <div className="header-wrapper">
      <div className="horizontal-line" />
      <div className="alphabet-menu-wrapper">
        <div className="horizontal-line" />
        <div className="horizontal-line" />
        <nav className="horizontal-scroller" aria-label="Browse by letter">
          <ul>
            {createLetter('NUM', '#')}
            {alphabetConst.map((letter) => createLetter(letter))}
          </ul>
        </nav>
        <div className="horizontal-line margin-top-zero" />
        <div className="horizontal-line" />
      </div>
    </div>
  );
}
