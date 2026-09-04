const BACK_ANGLE_PATTERN = /背面|背影|后背|背部|\brear\b|\bback\b/iu;
const SIDE_ANGLE_PATTERN = /侧面|侧脸|侧身|\bprofile\b|\bside\b/iu;
const PORTRAIT_ANGLE_PATTERN = /特写|近景|脸部|面部|脸|\bface\b|\bportrait\b|\bclose[ -]?up\b/iu;

export function selectStoryImageReferences(options) {
  const warnings = [];
  const retainedButNotSubmitted = [];
  const candidates = [];
  const nodeById = new Map(options.nodes.map((node) => [node.id, node]));
  const seenCharacterIds = new Set();
  const orderDescriptor = storyImageReferenceDescriptorOrderer();

  for (const characterId of appearingCharacterIds(options)) {
    if (!characterId || seenCharacterIds.has(characterId)) continue;
    seenCharacterIds.add(characterId);
    const character = options.characters.find((candidate) => candidate.id === characterId);
    if (!character) {
      const missingId = `story-character:${characterId}`;
      retainedButNotSubmitted.push(orderDescriptor({ id: missingId, sourceNodeId: missingId, mediaSource: 'missing', role: 'identity', entityId: characterId, label: `未解析角色 ${characterId}` }));
      warnings.push({ code: 'character_not_found', entityId: characterId, referenceId: missingId, message: `出场角色 ${characterId} 不在故事角色列表中，未提交身份参考。` });
      continue;
    }
    const parent = characterReferenceParent(character, options.nodes, nodeById);
    if (!parent) {
      const missingId = `story-character:${character.id}`;
      retainedButNotSubmitted.push(orderDescriptor({ id: missingId, sourceNodeId: missingId, mediaSource: 'missing', role: 'identity', entityId: character.id, label: `角色「${character.name}」缺失身份参考` }));
      warnings.push({ code: 'character_reference_missing', entityId: character.id, referenceId: missingId, message: `角色「${character.name}」缺少带明确语义的身份参考资产，未提交身份参考。` });
      continue;
    }
    const assetKind = parent.metadata?.storyCharacterAssetKind;
    if (assetKind === 'turnaround_sheet') {
      const selectedAngles = selectedAnglesForCharacter(options, characterId);
      const derivedViews = completeDerivedViews(parent.metadata?.characterDerivedViews);
      if (derivedViews) {
        selectedAngles.forEach((angle) => {
          const derived = derivedViews.get(angle);
          if (derived) candidates.push(orderDescriptor(derivedViewDescriptor(character, parent.id, derived)));
        });
        continue;
      }
      const sheet = orderDescriptor({
        ...nodeDescriptor(parent, 'identity', character.id, `角色「${character.name}」四视图设定表`),
        angle: 'identity',
      });
      candidates.push(sheet);
      warnings.push({
        code: 'character_derived_view_missing',
        entityId: character.id,
        referenceId: parent.id,
        message: `角色「${character.name}」单视图尚未切出（镜头需要：${selectedAngles.map(angleLabel).join('、')}）；先提交整张四视图设定表作为一张身份参考。`,
      });
      continue;
    }
    if (assetKind === 'identity_reference') {
      candidates.push(orderDescriptor({ ...nodeDescriptor(parent, 'identity', character.id, `角色「${character.name}」身份参考`), angle: 'identity' }));
      continue;
    }
    retainedButNotSubmitted.push(orderDescriptor(nodeDescriptor(parent, 'identity', character.id, `角色「${character.name}」身份参考`)));
    warnings.push({ code: 'character_reference_missing', entityId: character.id, referenceId: parent.id, message: `角色「${character.name}」的参考资产未标记为 identity_reference 或 turnaround_sheet，未提交。` });
  }
  for (const reference of options.unboundCharacterReferences || []) {
    const descriptor = orderDescriptor(nodeDescriptor(reference.node, 'identity', undefined, candidateLabel(reference)));
    retainedButNotSubmitted.push(descriptor);
    warnings.push({ code: 'character_reference_missing', referenceId: descriptor.id, message: `角色输入「${descriptor.label}」无法唯一绑定到故事角色，已保留但未提交。` });
  }

  appendSceneCandidates(candidates, retainedButNotSubmitted, warnings, options.sceneReferences || [], options.shot.sceneId, orderDescriptor);
  appendCandidates(candidates, retainedButNotSubmitted, warnings, options.propReferences || [], 'prop', orderDescriptor);
  appendOtherCandidates(candidates, retainedButNotSubmitted, warnings, options.otherReferences || [], orderDescriptor);

  const hardBlockingReason = warnings.find((warning) => warning.code === 'character_not_found' || warning.code === 'character_reference_missing')?.code;
  const referenceIntent = candidates.length > 0 || retainedButNotSubmitted.length > 0 || Boolean(hardBlockingReason);
  const plannedOperation = options.requestedOperation || (referenceIntent ? 'edit' : 'generate');
  const uniqueCandidates = [];
  const seenReferenceKeys = new Set();
  for (const candidate of candidates) {
    if (candidate.mediaSource === 'missing') {
      retainedButNotSubmitted.push(candidate);
      warnings.push({ code: 'reference_media_missing', referenceId: candidate.id, entityId: candidate.entityId, message: `参考「${candidate.label}」没有可解析的 storageKey、content 或 backendUrl，已保留但未提交。` });
      continue;
    }
    const key = `${candidate.id}\u0000${descriptorMediaKey(candidate)}`;
    if (seenReferenceKeys.has(key)) {
      retainedButNotSubmitted.push(candidate);
      warnings.push({ code: 'duplicate_reference_retained', referenceId: candidate.id, entityId: candidate.entityId, message: `参考「${candidate.label}」重复出现，已保留但不会重复提交。` });
      continue;
    }
    seenReferenceKeys.add(key);
    uniqueCandidates.push(candidate);
  }

  if (options.capability.referenceCount.state !== 'supported' && referenceIntent) {
    retainedButNotSubmitted.push(...uniqueCandidates);
    uniqueCandidates.forEach((candidate) => warnings.push({
      code: options.capability.referenceCount.state === 'unsupported' ? 'references_unsupported' : 'references_unknown',
      referenceId: candidate.id,
      entityId: candidate.entityId,
      message: options.capability.referenceCount.state === 'unsupported'
        ? `所选模型不支持参考图；参考「${candidate.label}」已保留但提交数为 0。`
        : `所选模型的参考图合同未验证；参考「${candidate.label}」已保留但提交数为 0。`,
    }));
    // Reference intent on an unsupported or unverified contract stays
    // fail-closed. Paid generate must not silently drop the references.
    return emptySubmission(retainedButNotSubmitted, warnings, {
      state: 'blocked',
      operation: plannedOperation,
      referenceIntent: true,
      reasonCode: hardBlockingReason || (options.capability.referenceCount.state === 'unsupported' ? 'references_unsupported' : 'references_unknown'),
    });
  }

  if (options.capability.referenceCount.state !== 'supported') {
    return emptySubmission(retainedButNotSubmitted, warnings, { state: 'ready', operation: plannedOperation, referenceIntent: false });
  }

  const max = options.capability.referenceCount.max;
  const submittedCandidates = max === null ? uniqueCandidates : uniqueCandidates.slice(0, Math.max(0, max));
  const overflow = max === null ? [] : uniqueCandidates.slice(Math.max(0, max));
  if (overflow.length) {
    retainedButNotSubmitted.push(...overflow);
    overflow.forEach((candidate) => warnings.push({
      code: 'reference_count_limited',
      referenceId: candidate.id,
      entityId: candidate.entityId,
      message: `所选模型最多提交 ${max} 张参考图；参考「${candidate.label}」已保留但未提交。`,
    }));
  }

  const submitted = submittedCandidates.map((descriptor, index) => {
    const imageNumber = index + 1;
    return {
      ...descriptor,
      imageNumber,
      promptDescription: promptDescription(
        imageNumber,
        descriptor,
        options.capability.storyPromptConstraintStyle || 'explicit-exclusions',
        options.promptScope || 'single',
      ),
    };
  });
  const submissionPlan = hardBlockingReason
    ? { state: 'blocked', operation: plannedOperation, referenceIntent: true, reasonCode: hardBlockingReason }
    : submitted.length > 0
    ? { state: 'ready', operation: plannedOperation, referenceIntent: true }
    : referenceIntent
      ? { state: 'blocked', operation: plannedOperation, referenceIntent: true, reasonCode: firstBlockingReason(warnings) }
      : { state: 'ready', operation: plannedOperation, referenceIntent: false };
  return {
    submitted,
    semanticDescriptors: submitted,
    retainedButNotSubmitted,
    warnings,
    submissionPlan,
    promptAppendix: options.capability.storyPromptConstraintStyle === 'positive-only' && submitted.length === 1 && submitted[0]?.role === 'identity'
      ? ''
      : submitted.map((reference) => reference.promptDescription).join('\n'),
  };
}

export function selectStoryCharacterReferenceAngle(shot) {
  const semanticText = [shot.title, shot.camera, shot.action, shot.visualContent, shot.imagePrompt]
    .filter((value) => typeof value === 'string')
    .join(' ');
  if (BACK_ANGLE_PATTERN.test(semanticText)) return 'back';
  if (SIDE_ANGLE_PATTERN.test(semanticText)) return 'side';
  if (PORTRAIT_ANGLE_PATTERN.test(semanticText)) return 'portrait';
  return 'front';
}

export function selectStoryCharacterReferenceAngles(shots) {
  const seen = new Set();
  const angles = [];
  shots.forEach((shot) => {
    const angle = selectStoryCharacterReferenceAngle(shot);
    if (seen.has(angle)) return;
    seen.add(angle);
    angles.push(angle);
  });
  return angles;
}

function appearingCharacterIds(options) {
  const shots = options.promptScope === 'grid9' && options.gridShots?.length ? options.gridShots : [options.shot];
  return [...new Set(shots.flatMap((shot) => shot.appearingCharacterIds || []).filter(Boolean))];
}

function selectedAnglesForCharacter(options, characterId) {
  if (options.identityReferenceStrategy === 'portrait-only') return ['portrait'];
  if (options.promptScope === 'grid9' && options.gridShots?.length) {
    const relevantShots = options.gridShots.filter((shot) => shot.appearingCharacterIds?.includes(characterId));
    const angles = selectStoryCharacterReferenceAngles(relevantShots);
    if (angles.length) return angles;
  }
  return [selectStoryCharacterReferenceAngle(options.shot)];
}

function characterReferenceParent(character, nodes, nodeById) {
  const explicit = character.referenceNodeId ? nodeById.get(character.referenceNodeId) : undefined;
  if (explicit) return explicit;
  return nodes.find((node) => node.metadata?.storyCharacterId === character.id &&
    (node.metadata.storyCharacterAssetKind === 'identity_reference' || node.metadata.storyCharacterAssetKind === 'turnaround_sheet'));
}

function completeDerivedViews(views) {
  const completeAngles = ['front', 'side', 'back', 'portrait'];
  if (!views || views.length !== completeAngles.length) return undefined;
  if (!completeAngles.every((expectedAngle) => {
    const matching = views.filter((view) => view.angle === expectedAngle && Boolean(view.id) && Boolean(view.storageKey));
    return matching.length === 1;
  })) return undefined;
  return new Map(views.map((view) => [view.angle, view]));
}

function derivedViewDescriptor(character, sourceNodeId, view) {
  return { id: view.id, sourceNodeId, storageKey: view.storageKey, mediaSource: 'storage-key', mimeType: view.mimeType, role: 'identity', entityId: character.id, angle: view.angle, label: `角色「${character.name}」${view.label || angleLabel(view.angle)}视图` };
}

function appendSceneCandidates(candidates, retained, warnings, references, sceneId, orderDescriptor) {
  for (const reference of references) {
    if (reference.role !== 'scene') continue;
    if (!sceneId) {
      const descriptor = orderDescriptor(nodeDescriptor(reference.node, 'scene', reference.entityId, candidateLabel(reference)));
      retained.push(descriptor);
      warnings.push({ code: 'scene_reference_unclassified', referenceId: descriptor.id, entityId: descriptor.entityId, message: `镜头缺少 sceneId；场景参考「${descriptor.label}」已保留但未提交。` });
      continue;
    }
    if (reference.entityId !== sceneId) {
      const descriptor = orderDescriptor(nodeDescriptor(reference.node, 'scene', reference.entityId, candidateLabel(reference)));
      retained.push(descriptor);
      warnings.push({ code: 'scene_reference_mismatch', referenceId: descriptor.id, entityId: descriptor.entityId, message: `场景参考「${descriptor.label}」属于 ${reference.entityId || '未分类场景'}，与当前镜头 ${sceneId} 不匹配；已保留但未提交。` });
      continue;
    }
    appendCandidate(candidates, retained, warnings, reference, 'scene', orderDescriptor);
  }
}

function appendCandidates(candidates, retained, warnings, references, expectedRole, orderDescriptor) {
  for (const reference of references) {
    if (reference.role !== expectedRole) continue;
    appendCandidate(candidates, retained, warnings, reference, expectedRole, orderDescriptor);
  }
}

function appendOtherCandidates(candidates, retained, warnings, references, orderDescriptor) {
  for (const reference of references) {
    if (reference.role === 'story' || reference.role === 'style') {
      appendCandidate(candidates, retained, warnings, reference, reference.role, orderDescriptor);
      continue;
    }
    const descriptor = orderDescriptor(nodeDescriptor(reference.node, 'story', reference.entityId, candidateLabel(reference)));
    retained.push(descriptor);
    warnings.push({ code: 'ambiguous_other_reference_retained', referenceId: reference.node.id, entityId: reference.entityId, message: `其它参考「${descriptor.label}」未明确标记为 story 或 style，已保留但未提交。` });
  }
}

function appendCandidate(candidates, retained, warnings, reference, role, orderDescriptor) {
  if (reference.node.metadata?.storyCharacterAssetKind === 'turnaround_sheet') {
    const descriptor = orderDescriptor(nodeDescriptor(reference.node, role, reference.entityId, candidateLabel(reference)));
    retained.push(descriptor);
    warnings.push({ code: 'turnaround_sheet_retained', referenceId: reference.node.id, entityId: reference.entityId, message: `四视图设定表「${descriptor.label}」已保留但未提交；调用侧须显式扩展为单视图资产。` });
    return;
  }
  candidates.push(orderDescriptor(nodeDescriptor(reference.node, role, reference.entityId, candidateLabel(reference))));
}

function nodeDescriptor(node, role, entityId, label) {
  const storageKey = stringValue(node.metadata?.storageKey);
  const content = stringValue(node.metadata?.content);
  const backendUrl = stringValue(node.metadata?.backendUrl);
  const mediaSource = storageKey ? 'storage-key' : content ? 'content' : backendUrl ? 'backend-url' : 'missing';
  const mimeType = stringValue(node.metadata?.mimeType);
  return {
    id: node.id,
    sourceNodeId: node.id,
    ...(storageKey ? { storageKey } : {}),
    ...(content ? { dataUrl: content } : {}),
    ...(backendUrl ? { url: backendUrl } : {}),
    mediaSource,
    ...(mimeType ? { mimeType } : {}),
    role,
    ...(entityId ? { entityId } : {}),
    label,
  };
}

function storyImageReferenceDescriptorOrderer() {
  let originalOrder = 0;
  const occurrences = new Map();
  return (descriptor) => {
    const semanticKey = [
      descriptor.role,
      descriptor.sourceNodeId,
      descriptor.id,
      descriptor.entityId || '',
      descriptor.angle || '',
    ].map((value) => encodeURIComponent(value)).join(':');
    const occurrence = occurrences.get(semanticKey) || 0;
    occurrences.set(semanticKey, occurrence + 1);
    return {
      ...descriptor,
      candidateKey: `story-reference:${semanticKey}:${occurrence}`,
      originalOrder: originalOrder++,
    };
  };
}

function candidateLabel(reference) {
  return stringValue(reference.label) || stringValue(reference.node.title) || reference.node.id;
}

function emptySubmission(retainedButNotSubmitted, warnings, submissionPlan) {
  return { submitted: [], semanticDescriptors: [], retainedButNotSubmitted, warnings, submissionPlan, promptAppendix: '' };
}

function descriptorMediaKey(descriptor) {
  return descriptor.storageKey || descriptor.dataUrl || descriptor.url || 'missing';
}

function firstBlockingReason(warnings) {
  return warnings.find((warning) =>
    warning.code === 'character_not_found' ||
    warning.code === 'character_reference_missing' ||
    warning.code === 'reference_media_missing' ||
    warning.code === 'scene_reference_unclassified' ||
    warning.code === 'scene_reference_mismatch' ||
    warning.code === 'ambiguous_other_reference_retained' ||
    warning.code === 'reference_count_limited'
  )?.code || 'reference_media_missing';
}

function promptDescription(imageNumber, reference, constraintStyle, scope) {
  const prefix = `Image ${imageNumber}`;
  const name = reference.role === 'identity' ? reference.label.replace(/^角色「|」.*$/gu, '') : reference.label;
  if (constraintStyle === 'positive-only') {
    if (reference.role === 'identity') {
      if (scope === 'grid9') return `${prefix}：角色「${name}」身份与服装来源；继承脸型、发型、服装、配色和气质；各画格的角色名单与数量以对应画格的主体数量与身份为准。`;
      return `${prefix}：角色「${name}」身份与服装来源；继承脸型、发型、服装、配色和气质；镜头角色数量映射为「${name}」×1。`;
    }
    if (reference.role === 'scene') return `${prefix}：场景「${name}」环境来源；继承空间结构、光线、色彩和氛围。`;
    if (reference.role === 'prop') return `${prefix}：道具「${name}」造型来源；继承外形、材质、纹理、颜色和关键结构。`;
    if (reference.role === 'style') return `${prefix}：风格「${name}」视觉来源；继承色彩、质感和视觉语言。`;
    return `${prefix}：故事「${name}」世界设定来源；继承叙事氛围、色彩和整体连续性。`;
  }
  if (reference.role === 'identity') return `${prefix}：角色「${name}」的唯一身份参考（${angleLabel(reference.angle)}），只用于保持该单一角色的身份和外观（脸型、发型、服装、配色）；不继承输入图的姿态、景别、白底、留白或站位；该角色保持唯一一个实体，不得复制为多个实体。`;
  if (reference.role === 'scene') return `${prefix}：场景「${reference.label}」参考，仅用于环境、空间、光线与构图；不得带入人物。`;
  if (reference.role === 'prop') return `${prefix}：道具「${reference.label}」参考，仅用于保留该道具的外形、材质与关键结构；不得带入人物。`;
  if (reference.role === 'style') return `${prefix}：风格「${reference.label}」参考，仅用于色彩、质感与视觉风格；不得带入人物或额外实体。`;
  return `${prefix}：故事「${reference.label}」参考，仅用于叙事氛围与整体视觉方向；不得带入人物或额外实体。`;
}

function angleLabel(angle) {
  if (angle === 'back') return '背面';
  if (angle === 'side') return '侧面';
  if (angle === 'portrait') return '特写';
  if (angle === 'identity') return '单图';
  return '正面';
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}
