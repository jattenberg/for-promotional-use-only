import { useNavigate } from 'react-router-dom';
import { letterToRoute } from './songUtils';

const alphabetConst = 'abcdefghijklmnopqrstuvwxyz'.toUpperCase().split('');

export default function AlphabetMenu({ activeLetter }) {
  const navigate = useNavigate();

  const activeLetterClass = (letter) =>
    activeLetter === letter ? 'active-letter' : '';

  const navigateToLetter = (letter) => {
    navigate('/' + letterToRoute(letter));
  };

  const createLetter = (letter) => (
    <li
      key={letter}
      onClick={() => navigateToLetter(letter)}
      className={activeLetterClass(letter)}
    >
      {letter}
    </li>
  );

  return (
    <div className="header-wrapper">
      <div className="horizontal-line" />
      <div className="alphabet-menu-wrapper">
        <div className="horizontal-line" />
        <div className="horizontal-line" />
        <div className="horizontal-scroller">
          <ul>
            <li
              key="NUM"
              onClick={() => navigateToLetter('NUM')}
              className={activeLetterClass('NUM')}
            >
              #
            </li>
            {alphabetConst.map((letter) => createLetter(letter))}
          </ul>
        </div>
        <div className="horizontal-line margin-top-zero" />
        <div className="horizontal-line" />
      </div>
    </div>
  );
}
