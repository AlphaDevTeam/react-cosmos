/* eslint-env browser */
/* eslint-disable react/no-string-refs, react/no-find-dom-node, react/sort-comp */

import _ from 'lodash';
import React from 'react';
import classNames from 'classnames';
import ComponentTree from 'react-component-tree';
import ReactQuerystringRouter from 'react-querystring-router';
import CodeMirror from 'react-codemirror';
import fuzzaldrinPlus from 'fuzzaldrin-plus';
import SplitPane from 'ubervu-react-split-pane';
import localStorageLib from '../lib/local-storage';
import { isSerializable } from '../lib/is-serializable';

const { findDOMNode } = require('react-dom-polyfill')(React);
const style = require('./component-playground.less');

require('codemirror/lib/codemirror.css');
require('codemirror/addon/fold/foldgutter.css');
require('codemirror/theme/solarized.css');
require('./codemirror.css');

require('codemirror/mode/javascript/javascript');
require('codemirror/addon/fold/foldcode');
require('codemirror/addon/fold/foldgutter');
require('codemirror/addon/fold/brace-fold');

const { stringifyParams, parseLocation } = ReactQuerystringRouter.uri;

// eslint-disable-next-line react/prefer-es6-class
module.exports = React.createClass({
  /**
   * ComponentPlayground provides a minimal frame for loading React components
   * in isolation. It can either render the component full-screen or with the
   * navigation pane on the side.
   */
  displayName: 'ComponentPlayground',

  propTypes: {
    components: React.PropTypes.object.isRequired,
    fixtures: React.PropTypes.object.isRequired,
    component: React.PropTypes.string,
    containerClassName: React.PropTypes.string,
    editor: React.PropTypes.bool,
    fixture: React.PropTypes.string,
    fullScreen: React.PropTypes.bool,
    firstProxy: React.PropTypes.shape({
      value: React.PropTypes.func,
      next: React.PropTypes.func,
    }).isRequired,
    router: React.PropTypes.object,
  },

  mixins: [ComponentTree.Mixin],

  statics: {
    isFixtureSelected(props) {
      return !!(props.component && props.fixture);
    },

    didFixtureChange(prevProps, nextProps) {
      return prevProps.component !== nextProps.component ||
             prevProps.fixture !== nextProps.fixture;
    },

    getSelectedComponentClass(props) {
      return props.components[props.component];
    },

    getSelectedFixtureContents(props) {
      // This returns the fixture contents as it is initially defined, excluding any modifications.
      return props.fixtures[props.component][props.fixture];
    },

    getStringifiedFixtureContents(fixtureContents) {
      return JSON.stringify(fixtureContents, null, 2);
    },

    getFixtureState(props) {
      const state = {
        fixtureContents: {},
        fixtureUnserializableProps: {},
        fixtureUserInput: '{}',
        isFixtureUserInputValid: true,
      };

      if (this.isFixtureSelected(props)) {
        const originalFixtureContents = this.getSelectedFixtureContents(props);
        const fixtureContents = {};
        const fixtureUnserializableProps = {};

        // Unserializable props are stored separately from serializable ones
        // because the serializable props can be overriden by the user using
        // the editor, while the unserializable props are always attached
        // behind the scenes
        _.forEach(originalFixtureContents, (value, key) => {
          if (isSerializable(value)) {
            fixtureContents[key] = value;
          } else {
            fixtureUnserializableProps[key] = value;
          }
        });

        _.assign(state, {
          fixtureContents,
          fixtureUnserializableProps,
          fixtureUserInput: this.getStringifiedFixtureContents(fixtureContents),
        });
      }

      return state;
    },
  },

  getDefaultProps() {
    return {
      editor: false,
      fullScreen: false,
      proxies: [],
    };
  },

  getInitialState() {
    const defaultState = {
      fixtureChange: 0,
      isEditorFocused: false,
      orientation: 'landscape',
      searchText: '',
    };

    return _.assign(defaultState, this.constructor.getFixtureState(this.props));
  },

  children: {
    splitPane() {
      return {
        component: SplitPane,
        key: 'editorPreviewSplitPane',
        split: this.getOrientationDirection(),
        defaultSize: localStorageLib.get('splitPos'),
        onChange: (size => localStorageLib.set('splitPos', size)),
        minSize: 20,
        resizerClassName: this.getSplitPaneClasses('resizer'),
        children: [
          this.renderFixtureEditor(),
          this.renderPreview(),
        ],
      };
    },

    editor() {
      return {
        component: CodeMirror,
        key: 'editor',
        value: this.state.fixtureUserInput,
        onChange: this.onFixtureChange,
        onFocusChange: this.onEditorFocusChange,
        options: {
          mode: 'javascript',
          foldGutter: true,
          lineNumbers: true,
          theme: 'solarized light',
          gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        },
      };
    },
  },

  render() {
    const isFixtureSelected = this.isFixtureSelected();

    const classes = classNames({
      [style['component-playground']]: true,
      [style['full-screen']]: this.props.fullScreen,
    });

    return (
      <div className={classes}>
        <div className={style['left-nav']}>
          <div className={style.header}>
            {this.renderHomeButton()}
            {isFixtureSelected ? this.renderMenu() : null}
          </div>
          <div className={style['filter-input-container']}>
            <input
              ref="filterInput"
              className={style['filter-input']}
              placeholder="Search..."
              onChange={this.onSearchChange}
            />
            <i className={style['filter-input-icon']} />
          </div>
          <div className={style.fixtures}>
            {this.renderFixtures()}
          </div>
        </div>
        {isFixtureSelected ? this.renderContentFrame() : null}
      </div>
    );
  },

  renderPreview() {
    return (
      <div
        ref="previewContainer"
        key="previewContainer"
        className={this.getPreviewClasses()}
      >
        {this.renderComponent()}
      </div>
    );
  },

  renderComponent() {
    const { firstProxy } = this.props;

    return React.createElement(firstProxy.value, {
      // Re-render whenever fixture changes
      key: this.getComponentKey(),
      nextProxy: firstProxy.next(),
      fixture: this.getCurrentFixtureContents(),
      onPreviewRef: (previewComponent) => {
        this.previewComponent = previewComponent;
      },
      onFixtureUpdate: this.onFixtureUpdate,
    });
  },

  renderFixtures() {
    return (
      <ul className={style.components}>
        {_.map(this.getFilteredFixtures(), (componentFixtures, componentName) => (
          <li className={style.component} key={componentName}>
            <p
              ref={`componentName-${componentName}`}
              className={style['component-name']}
            >
              {componentName}
            </p>
            {this.renderComponentFixtures(componentName, componentFixtures)}
          </li>
        ))}
      </ul>
    );
  },

  renderComponentFixtures(componentName, fixtures) {
    return (
      <ul className={style['component-fixtures']}>
        {_.map(fixtures, (props, fixtureName) => {
          const fixtureProps = this.extendFixtureRoute({
            component: componentName,
            fixture: fixtureName,
          });

          return (
            <li
              className={this.getFixtureClasses(componentName, fixtureName)}
              key={fixtureName}
            >
              <a
                ref={`fixtureButton-${componentName}-${fixtureName}`}
                href={stringifyParams(fixtureProps)}
                title={fixtureName}
                onClick={this.onFixtureClick}
              >
                {fixtureName}
              </a>
            </li>
          );
        })}
      </ul>
    );
  },

  renderContentFrame() {
    return (
      <div ref="contentFrame" className={this.getContentFrameClasses()}>
        {this.props.editor ? this.loadChild('splitPane') : this.renderPreview()}
      </div>
    );
  },

  renderFixtureEditor() {
    return (
      <div key="fixture-editor-outer" className={style['fixture-editor-outer']}>
        {this.loadChild('editor')}
      </div>
    );
  },

  renderHomeButton() {
    const classes = classNames({
      [style.button]: true,
      [style['play-button']]: true,
      [style['selected-button']]: !this.isFixtureSelected(),
    });

    return (
      <a
        ref="homeButton"
        className={classes}
        href={stringifyParams({})}
        onClick={this.props.router.routeLink}
      >
        <span className={style.electron} />
      </a>
    );
  },

  renderMenu() {
    return (
      <p className={style.menu}>
        {this.renderFixtureEditorButton()}
        {this.renderFullScreenButton()}
      </p>
    );
  },

  renderFixtureEditorButton() {
    const classes = classNames({
      [style.button]: true,
      [style['fixture-editor-button']]: true,
      [style['selected-button']]: this.props.editor,
    });

    const editorUrlProps = this.extendFixtureRoute({
      editor: !this.props.editor,
    });

    return (
      <a
        className={classes}
        href={stringifyParams(editorUrlProps)}
        ref="editorButton"
        onClick={this.props.router.routeLink}
      />
    );
  },

  renderFullScreenButton() {
    const fullScreenProps = this.extendFixtureRoute({
      fullScreen: true,
      editor: false,
    });

    return (
      <a
        className={`${style.button} ${style['full-screen-button']}`}
        href={stringifyParams(fullScreenProps)}
        ref="fullScreenButton"
        onClick={this.props.router.routeLink}
      />
    );
  },

  componentDidMount() {
    window.addEventListener('resize', this.onWindowResize);

    this.updateContentFrameOrientation();

    if (this.props.component) {
      findDOMNode(this.refs[`componentName-${this.props.component}`])
          .scrollIntoView({ behavior: 'smooth' });
    }
  },

  componentWillReceiveProps(nextProps) {
    if (this.constructor.didFixtureChange(this.props, nextProps)) {
      this.setState(this.constructor.getFixtureState(nextProps));
    }
  },

  componentWillUnmount() {
    window.removeEventListener('resize', this.onWindowResize);
  },

  onFixtureClick(event) {
    event.preventDefault();

    const location = event.currentTarget.href;
    const params = parseLocation(location);

    if (this.constructor.didFixtureChange(this.props, params)) {
      this.props.router.goTo(location);
    } else {
      // This happens when we want to reset a fixture to its original state by
      // clicking on the fixture button while already selected
      const originalState = this.constructor.getFixtureState(this.props);

      // We also need to bump fixtureChange to trigger a key change for the
      // preview child, because the component and fixture names didn't change
      this.setState(_.assign(originalState, {
        fixtureChange: this.state.fixtureChange + 1,
      }));
    }
  },

  onEditorFocusChange(isFocused) {
    this.setState({ isEditorFocused: isFocused });
  },

  onFixtureUpdate(fixturePatch) {
    // Don't update fixture contents while the user is editing the fixture
    if (this.state.isEditorFocused) {
      return;
    }

    // XXX: We assume data received in this handler is serializable (& thus
    // part of state.fixtureContents)
    const fixtureContents = {
      ...this.state.fixtureContents,
      ...fixturePatch,
    };

    this.setState({
      fixtureContents,
      fixtureUserInput:
          this.constructor.getStringifiedFixtureContents(fixtureContents),
      isFixtureUserInputValid: true,
    });
  },

  onFixtureChange(editorValue) {
    const newState = { fixtureUserInput: editorValue };

    try {
      const fixtureContents = {};

      if (editorValue) {
        _.merge(fixtureContents, JSON.parse(editorValue));
      }

      _.assign(newState, {
        fixtureContents,
        fixtureChange: this.state.fixtureChange + 1,
        isFixtureUserInputValid: true,
      });
    } catch (e) {
      newState.isFixtureUserInputValid = false;
      // eslint-disable-next-line no-console
      console.error(e);
    }

    this.setState(newState);
  },

  onWindowResize() {
    this.updateContentFrameOrientation();
  },

  onSearchChange(e) {
    this.setState({
      searchText: e.target.value,
    });
  },

  isFixtureSelected() {
    return this.constructor.isFixtureSelected(this.props);
  },

  getComponentKey() {
    return `${this.props.component}-${this.props.fixture}-${this.state.fixtureChange}`;
  },

  getContentFrameClasses() {
    return classNames({
      [style['content-frame']]: true,
    });
  },

  getPreviewClasses() {
    const classes = {
      [style.preview]: true,
    };

    if (this.props.containerClassName) {
      classes[this.props.containerClassName] = true;
    }

    return classNames(classes);
  },

  getFixtureClasses(componentName, fixtureName) {
    return classNames({
      [style['component-fixture']]: true,
      [style.selected]: this.isCurrentFixtureSelected(componentName, fixtureName),
    });
  },

  isCurrentFixtureSelected(componentName, fixtureName) {
    return componentName === this.props.component &&
           fixtureName === this.props.fixture;
  },

  extendFixtureRoute(newProps) {
    const currentProps = {
      component: this.props.component,
      fixture: this.props.fixture,
      editor: this.props.editor,
      fullScreen: this.props.fullScreen,
    };

    const defaultProps = this.constructor.getDefaultProps();
    const props = _.assign(_.omit(currentProps, _.keys(newProps)), newProps);

    // No need to include props with default values
    return _.omit(props, (value, key) => value === defaultProps[key]);
  },

  updateContentFrameOrientation() {
    if (!this.isFixtureSelected()) {
      return;
    }

    const contentNode = this.getContentNode();

    this.setState({
      orientation: contentNode.offsetHeight > contentNode.offsetWidth ?
                   'portrait' : 'landscape',
    });
  },

  getCurrentFixtureContents() {
    // This returns the fixture contents as it currently is, including user modifications.
    const {
      fixtureUnserializableProps,
      fixtureContents,
    } = this.state;

    return {
      component: this.constructor.getSelectedComponentClass(this.props),
      ...fixtureUnserializableProps,
      ...fixtureContents,
    };
  },

  getOrientationDirection() {
    return this.state.orientation === 'landscape' ? 'vertical' : 'horizontal';
  },

  getSplitPaneClasses(type) {
    return classNames(style[this.getOrientationDirection()], style[type]);
  },

  getContentNode() {
    return findDOMNode(this.refs.contentFrame);
  },

  getFilteredFixtures() {
    const fixtures = this.props.fixtures;

    if (this.state.searchText.length < 2) {
      return fixtures;
    }

    return _.reduce(fixtures, (acc, componentFixtures, componentName) => {
      const fixtureNames = Object.keys(componentFixtures);
      const search = this.state.searchText;

      const filteredFixtureNames = _.filter(fixtureNames, (fixtureName) => {
        const componentAndFixture = componentName + fixtureName;
        const fixtureAndComponent = fixtureName + componentName;

        // Ensure that the fuzzy search is working in both direction.
        // component + fixture and fixture + component. That's because the user
        // can search for fixture name and afterwards for component name and
        // we want to show the correct result.
        return !_.isEmpty(fuzzaldrinPlus.match(componentAndFixture, search)) ||
               !_.isEmpty(fuzzaldrinPlus.match(fixtureAndComponent, search)) ||
               this.isCurrentFixtureSelected(componentName, fixtureName);
      });

      // Do not render the component if there are no fixtures
      if (filteredFixtureNames.length === 0) {
        return acc;
      }

      // Show only the fixtures that matched the search query
      const filteredFixtures = _.reduce(filteredFixtureNames, (acc2, fixture) => {
        // eslint-disable-next-line no-param-reassign
        acc2[fixture] = componentFixtures[fixture];

        return acc2;
      }, {});

      // eslint-disable-next-line no-param-reassign
      acc[componentName] = filteredFixtures;

      return acc;
    }, {});
  },
});
