import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { letterToRoute } from './songUtils';

const alphabetConst = "abcdefghijklmnopqrstuvwxyz".toUpperCase().split("");

class AlphabetMenu extends Component {
  activeLetterClass = letter => {
    const activeLetter = this.props.activeLetter;
    let activeLetterClass = "";
    if (activeLetter === letter) {
        activeLetterClass="active-letter";
    }
    return activeLetterClass;
  }

  navigateToLetter = (letter) => {
    const { history } = this.props;
    history.push('/' + letterToRoute(letter));
  }

  createLetter = (letter) => {
    return (
      <li
        key={letter}
        onClick={ ()=>this.navigateToLetter(letter)}
        className={this.activeLetterClass(letter)}
        >{letter}</li>
    )
  }

  render = () => {
    return (
      <React.Fragment>
        <div className="header-wrapper">
          <div className="horizontal-line"></div>
          <div className="alphabet-menu-wrapper">
              <div className="horizontal-line"></div>
              <div className="horizontal-line"></div>

              <div className="horizontal-scroller">
                <ul>
                  <li
                    key={"NUM"}
                    onClick={ ()=>this.navigateToLetter("NUM")}
                    className={this.activeLetterClass("NUM")}
                    >#</li>

                  { alphabetConst.map((letter) => this.createLetter(letter) ) }
                </ul>
              </div>

              <div className="horizontal-line margin-top-zero"></div>
              <div className="horizontal-line"></div>
          </div>
        </div>
      </React.Fragment>
    )
  }
}

export default withRouter(AlphabetMenu);
