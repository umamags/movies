const BACKEND_URL = 'http://localhost:4000';

export async function checkBackendHealth() {
  try {
    const response = await fetch(`${BACKEND_URL}/health`);
    return response.ok;
  } catch (error) {
    console.warn('Backend health check failed:', error);
    return false;
  }
}

export async function graphqlQuery(query, variables = {}) {
  try {
    const response = await fetch(`${BACKEND_URL}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.errors && data.errors.length > 0) {
      const errorMsg = data.errors.map(e => e.message).join(', ');
      throw new Error(`GraphQL Error: ${errorMsg}`);
    }

    return data.data;
  } catch (error) {
    console.error('GraphQL request failed:', error);
    throw error;
  }
}

export async function listVideos(folder) {
  const query = `
    query ListVideos($folder: String!) {
      listVideos(folder: $folder) {
        id
        filename
        path
        duration
        size
        format
      }
    }
  `;
  const response = await fetch(`${BACKEND_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      variables: { folder }
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.errors && data.errors.length > 0) {
    const errorMsg = data.errors.map(e => e.message).join(', ');
    throw new Error(`GraphQL Error: ${errorMsg}`);
  }

  return data.data;
}

export async function getThumbnail(videoPath) {
  const query = `
    query GetThumbnail($videoPath: String!) {
      getThumbnail(videoPath: $videoPath)
    }
  `;
  const response = await fetch(`${BACKEND_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      variables: { videoPath }
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.errors && data.errors.length > 0) {
    const errorMsg = data.errors.map(e => e.message).join(', ');
    throw new Error(`GraphQL Error: ${errorMsg}`);
  }

  return data.data.getThumbnail;
}

export async function combineVideos(inputFolder, filePaths, outputName, quality) {
  const mutation = `
    mutation CombineVideos($inputFolder: String!, $filePaths: [String!]!, $outputName: String!, $quality: String!) {
      combineVideos(input: {
        inputFolder: $inputFolder
        filePaths: $filePaths
        outputName: $outputName
        quality: $quality
      }) {
        id
        outputPath
        duration
        status
      }
    }
  `;
  const response = await fetch(`${BACKEND_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: mutation,
      variables: {
        inputFolder,
        filePaths,
        outputName,
        quality
      }
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.errors && data.errors.length > 0) {
    const errorMsg = data.errors.map(e => e.message).join(', ');
    throw new Error(`GraphQL Error: ${errorMsg}`);
  }

  return data.data;
}

export async function getSettings() {
  const query = `
    query {
      getSettings {
        defaultFolder
        outputQuality
        lastOutputName
      }
    }
  `;
  return graphqlQuery(query);
}

export async function saveSettings(defaultFolder, outputQuality, lastOutputName) {
  const mutation = `
    mutation {
      saveSettings(
        defaultFolder: "${defaultFolder.replace(/"/g, '\\"')}"
        outputQuality: "${outputQuality}"
        lastOutputName: "${lastOutputName.replace(/"/g, '\\"')}"
      ) {
        defaultFolder
        outputQuality
        lastOutputName
      }
    }
  `;
  return graphqlQuery(mutation);
}
