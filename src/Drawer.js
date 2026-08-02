import React from 'react';
import PropTypes from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import Drawer from '@material-ui/core/Drawer';
import Button from '@material-ui/core/Button';

const styles = {
  list: {
    width: 250,
  },
  fullList: {
    width: 'auto',
  },
};

class TemporaryDrawer extends React.Component {
  state = {
    top: false,
    left: false,
    bottom: false,
    right: false,
  };

  toggleDrawer = (side, open) => () => {
    this.setState({
      [side]: open,
    });
  };

  toggleFavesDelete = (path, e) => {
    if (e) {
      e.stopPropagation();
    }
    this.props.toggleAddRemoveFavorites(path);
  }

  clearFavorites = (e) => {
    e.stopPropagation();
    if (window.confirm('Clear all favorites?')) {
      this.props.deleteAllFaves();
    }
  }

  clearRecents = (e) => {
    e.stopPropagation();
    if (window.confirm('Clear all recently played?')) {
      this.props.deleteAllRecents();
    }
  }

  playEntry = (path, { resume }) => (e) => {
    e.stopPropagation();
    this.setState({ left: false });
    if (this.props.onPlayMixtape) {
      this.props.onPlayMixtape(path, { resume });
    }
  }

  removeRecent = (path, e) => {
    e.stopPropagation();
    this.props.removeRecent(path);
  }

  renderFavorites = (favorites) => {
    if (Object.keys(favorites).length < 1) {
      return (
        <p className="default-empty-songs">None yet, start favoriting something!</p>
      )
    }
    return Object.keys(favorites).map((path) => {
      const entry = favorites[path];
      const title = entry && entry.title ? entry.title : path;
      return (
        <li key={path}>
          <button
            type="button"
            className="drawer-play"
            onClick={this.playEntry(path, { resume: true })}
          >
            {title}
          </button>
          <span className="delete"
                onClick={ (e)=> this.toggleFavesDelete(path, e)}>
                <i className="fas fa-times"></i>
          </span>
        </li>
      );
    })
  }

  renderRecentlyPlayed = (recentlyPlayed) => {
    if (Object.keys(recentlyPlayed).length < 1) {
      return (
        <p className="default-empty-songs">None yet, start playing something!</p>
      )
    }
    return Object.keys(recentlyPlayed).map((path) => {
      const entry = recentlyPlayed[path];
      const title = entry && entry.title ? entry.title : path;
      return (
        <li key={path}>
          <button
            type="button"
            className="drawer-play"
            onClick={this.playEntry(path, { resume: true })}
          >
            {title}
          </button>
          <span className="delete"
                onClick={ (e)=> this.removeRecent(path, e)}>
                <i className="fas fa-times"></i>
          </span>
        </li>
      );
    })
  }

  render() {
    const { favorites, recentlyPlayed } = this.props;

    const sideList = (
      <div className="drawer-wrapper">
        <h4>
          <i className="fas fa-star"></i>
          Favorites
          <button
            type="button"
            className="clear-all"
            onClick={this.clearFavorites}
          >
            Clear all
          </button>
        </h4>
        <ol>
          { this.renderFavorites(favorites) }
        </ol>
        <h4>
          <i className="fa fa-play"></i>
          Recently Played
          <button
            type="button"
            className="clear-all"
            onClick={this.clearRecents}
          >
            Clear all
          </button>
        </h4>
        <ol>
          { this.renderRecentlyPlayed(recentlyPlayed) }
        </ol>
      </div>

    );

    const modalProps = {
      BackdropProps: {
        classes: {
          root: "drawer-backdrop-override"
        }
      }
    }

    return (
      <div>
        <div className="star-button">
          <Button className="open-drawer" onClick={this.toggleDrawer('left', true)}>
            <i className="fas fa-star"></i>
          </Button>
        </div>

        <Drawer open={this.state.left} classes={ { "paper": "drawer-override" } } onClose={this.toggleDrawer('left', false)} ModalProps={ modalProps }>
          {sideList}
        </Drawer>
      </div>
    );
  }
}

TemporaryDrawer.propTypes = {
  classes: PropTypes.object.isRequired,
  onPlayMixtape: PropTypes.func,
};

export default withStyles(styles)(TemporaryDrawer);
