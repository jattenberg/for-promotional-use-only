import React from "react";
import { BrowserRouter, Route, Switch, Redirect } from "react-router-dom";
import App from "./App";
import NotFound from "./NotFound";

const Router = () => (
  <BrowserRouter>
    <Switch>
      <Route exact path="/" render={() => <Redirect to="/k" />} />
      <Route exact path="/:letter" component={App} />
      <Route component={NotFound} />
    </Switch>
  </BrowserRouter>
)

export default Router;
