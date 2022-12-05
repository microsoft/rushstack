import { window, workspace, commands } from 'vscode';
import { QuickPickItem, Disposable, WorkspaceFolder, Uri, TextDocument, QuickPick } from 'vscode';

import { RushConfiguration, RushConfigurationProject } from '@microsoft/rush-lib';

const rushCDCommand: Disposable = commands.registerCommand('rushstack-vscode-extension.rushCd', async () => {
  // First detect in the current workspace if there is a rush.json file
  const workspaceFolders: readonly WorkspaceFolder[] | undefined = workspace.workspaceFolders;
  if (!workspaceFolders) {
    return;
  }

  const rushJsonPath: string | undefined = RushConfiguration.tryFindRushJsonLocation({
    startingFolder: workspaceFolders[0].uri.fsPath
  });

  if (!rushJsonPath) {
    // eslint-disable-next-line no-void
    void window.showErrorMessage(
      'No rush.json file found in the current workspace. Are you sure this is a Rush Project?'
    );
    return;
  }

  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonPath);
  const { projects } = rushConfiguration;

  const projectQuickPickItems: QuickPickItem[] = projects.map((project) => {
    return {
      label: project.packageName,
      description: project.packageJson.description,
      detail: project.projectRelativeFolder
    };
  });

  const projectQuickPick: QuickPick<QuickPickItem> = window.createQuickPick();
  projectQuickPick.items = projectQuickPickItems;
  projectQuickPick.title = 'Select a project to open.';
  projectQuickPick.placeholder = 'Which Rush Project would you like to open?';
  projectQuickPick.matchOnDescription = true;
  projectQuickPick.matchOnDetail = true;
  projectQuickPick.show();
  projectQuickPick.onDidAccept(async () => {
    projectQuickPick.selectedItems.forEach(async (selectedProject) => {
      await openSelectedProjectPackageJson(rushConfiguration, selectedProject?.label);
    });
  });
});

async function openSelectedProjectPackageJson(
  rushConfiguration: RushConfiguration,
  projectName: string
): Promise<void> {
  const project: RushConfigurationProject | undefined = rushConfiguration.projects.find((project) => {
    return project.packageName === projectName;
  });

  if (!project) {
    return;
  }

  const packageJsonPath: string = project.packageJsonEditor.filePath;
  const packageJsonUri: Uri = Uri.file(packageJsonPath);
  const packageJsonDocument: TextDocument = await workspace.openTextDocument(packageJsonUri);
  await window.showTextDocument(packageJsonDocument);
}

export default rushCDCommand;
