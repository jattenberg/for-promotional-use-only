import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import AudioPlayer from 'react-responsive-audio-player';
import Collapse from '@material-ui/core/Collapse';
import {
  compareSongsForDisplay,
  mediaUrl,
  prepareSongForDisplay,
} from './songUtils';

class Songs extends Component {
  state = {
    currentlyPlayingSong: null
  }

  setCurrentlyPlayingSong = index => {
    this.setState({ currentlyPlayingSong: index});
  }

  setNothingPlaying = () => {
    this.setState({ currentlyPlayingSong: null});
  }

  setNextSong = (index) =>  {
    this.setCurrentlyPlayingSong(index + 1);
  }

  setPreviousSong = (index) =>  {
    this.setCurrentlyPlayingSong(index - 1);
  }

  renderSong = (song, index) => {
    const { songList, toggleAddRemoveFavorites, favorites, recordPlayed } = this.props;

    return (
      <SingleSong
        songList={songList}
        favorites={favorites}
        toggleAddRemoveFavorites={toggleAddRemoveFavorites}
        recordPlayed={recordPlayed}
        onNext={() => this.setNextSong(index)}
        onPrevious={() => this.setPreviousSong(index)}
        currentlyPlayingSong={this.state.currentlyPlayingSong}
        setNothingPlaying={this.setNothingPlaying}
        setCurrentlyPlayingSong={this.setCurrentlyPlayingSong}
        song={song}
        key={song + "-" + index}
        index={index} />
    );
  }

  render = () => {
    const { songList } = this.props;
    const sortedSongList = [...songList].sort(compareSongsForDisplay);
    return (
      <React.Fragment>
        <div className="body-content">
          <div className="total-songs">
            {sortedSongList.length > 0 ? sortedSongList.length + " songs" : null}
          </div>
          <ul className="songlist">
            {sortedSongList.map(this.renderSong)}
          </ul>
        </div>
      </React.Fragment>
    )
  }
}


class SingleSong extends Component {
  state = {
    unfurled: false
  }

  handleUnfurl = () => {
    this.setState(state => ({ unfurled: !state.unfurled }));
  }

  formatSongTitle = (song) => {
    return prepareSongForDisplay(song);
  }

  toggleDisplaySong = (currentlyPlayingSong) => {
    const { setNothingPlaying, setCurrentlyPlayingSong, index } = this.props;
    if (currentlyPlayingSong === index) {
      setNothingPlaying() ;
    } else {
      setCurrentlyPlayingSong(index);
    }
  }

  stopChildClickPropagation = (e) => {
    e.stopPropagation();
  }

  shouldRenderAudioPlayer = () => {
    const { index, currentlyPlayingSong } = this.props;
    return currentlyPlayingSong === index;
  }

  renderFavoritesCSS = (songPath) => {
    const { favorites } = this.props;
    let favoriteClass;
    if (favorites.hasOwnProperty(songPath)) {
        favoriteClass = "favorite fas fa-star already-favorited";
    } else {
        favoriteClass = "favorite far fa-star";
    }
    return ( favoriteClass )
  }

  handlePlay = (songPath) => {
    const { recordPlayed } = this.props;
    recordPlayed(songPath);
  }

  playPreviousTrack = () =>  {
    const { onPrevious } = this.props;
    onPrevious();
  }

  playNextTrack = () =>  {
    const { onNext } = this.props;
    onNext();
  }

  // B3 will replace this player; v1.3.1 exposes no onNext/onPrevious props.
  getAudioPlayerRef = (ref) =>  {
    if (this.audioPlayerRef) {
      const audioPlayerDOM = ReactDOM.findDOMNode(this.audioPlayerRef);
      const [previousButton, nextButton] = audioPlayerDOM.querySelectorAll('.skip_button');
      previousButton.removeEventListener('click', this.playPreviousTrack);
      nextButton.removeEventListener('click', this.playNextTrack);
    }

    this.audioPlayerRef = ref;

    if (ref) {
      const audioPlayerDOM = ReactDOM.findDOMNode(ref);
      const [previousButton, nextButton] = audioPlayerDOM.querySelectorAll('.skip_button');
      previousButton.addEventListener('click', this.playPreviousTrack);
      nextButton.addEventListener('click', this.playNextTrack);
    }
  }

  renderAudioPlayer = (playlist, song) =>  {
    const stopChildClickPropagation = this.stopChildClickPropagation;
    const { toggleAddRemoveFavorites } = this.props;
    const songSrc = playlist[0].url;
    return (
      <div className="relative">
        <div className="" onClick={ stopChildClickPropagation }>
          <AudioPlayer autoplay autoplayDelayInSeconds={0.5} ref={this.getAudioPlayerRef} cycle={false} playlist={playlist}
                       onMediaEvent={{"play": () => this.handlePlay(song)}}
          />
        </div>
        <div className="clearfix favorite-download" onClick={ stopChildClickPropagation }>
          <i className={ this.renderFavoritesCSS(song) }
             onClick={ () => toggleAddRemoveFavorites(song)}></i>
          <a href={songSrc}>
            <i className="download fas fa-download"></i>
          </a>
        </div>
      </div>
    )
  }

  render = () => {
    const { song, index, currentlyPlayingSong } = this.props;
    let songTitle = this.formatSongTitle(song);

    let url = mediaUrl(song);
    let playlist = [{url: url, title: songTitle}];

    return (
      <li
        className={"single-song-wrapper " + (this.shouldRenderAudioPlayer() ? "active" : "")}
        key={song + "-" + index}
        index={song + "-" + index}
        onClick= { (e)=> this.toggleDisplaySong(currentlyPlayingSong) }
        >
        <span className="title">{songTitle}</span>
          <Collapse in={this.shouldRenderAudioPlayer()} unmountOnExit timeout={{enter:300, exit:500}}>
            { this.renderAudioPlayer(playlist,song)}
          </Collapse>
      </li>
    )
  }

}

export default Songs;
