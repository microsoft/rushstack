// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React from 'react';

import { useAppSelector } from '../store/hooks/index.ts';

export const ProjectView: React.FC = () => {
  const { projectName, projectVersion, dependencies, devDependencies } = useAppSelector(
    (state) => state.project
  );

  return (
    <div>
      <h4>Project Name: {projectName}</h4>
      <h6>Project Version: {projectVersion}</h6>
      <h4>Dependencies:</h4>
      {dependencies &&
        Object.entries(dependencies).map(([depName, depVersion]) => (
          <p key={depName}>
            {depName}: {depVersion}
          </p>
        ))}
      <h4>Dev Dependencies:</h4>
      {devDependencies &&
        Object.entries(devDependencies).map(([depName, depVersion]) => (
          <p key={depName}>
            {depName}: {depVersion}
          </p>
        ))}
    </div>
  );
};
