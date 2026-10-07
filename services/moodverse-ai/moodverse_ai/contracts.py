"""Strict JSON contracts shared by the Moodverse local inference service."""

import json
import math
import re


MAX_REQUEST_BYTES = 256 * 1024
MAX_EMBED_INPUTS = 81
MAX_EMBED_TEXT_CHARS = 1200
MAX_RANK_CANDIDATES = 100
_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


class ContractError(ValueError):
    pass


def _fail(message):
    raise ContractError(message)


def _record(value, keys, label):
    if not isinstance(value, dict) or set(value) != set(keys):
        _fail("invalid " + label + " shape")
    return value


def _string(value, label, maximum, allow_empty=False):
    if not isinstance(value, str):
        _fail("invalid " + label)
    result = value.strip()
    if len(result) > maximum or (not result and not allow_empty):
        _fail("invalid " + label)
    return result


def _string_list(value, label, maximum_items=12, maximum_chars=80):
    if not isinstance(value, list) or len(value) > maximum_items:
        _fail("invalid " + label)
    return [_string(item, label + " item", maximum_chars) for item in value]


def _request_object(value):
    if not isinstance(value, dict):
        _fail("request must be an object")
    try:
        encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (TypeError, ValueError):
        _fail("request is not valid JSON data")
    if len(encoded) > MAX_REQUEST_BYTES:
        _fail("request is too large")
    return value


def _schema_version(value):
    if isinstance(value, bool) or value != 1:
        _fail("unsupported schema version")
    return 1


def validate_composition_request(value):
    value = _request_object(value)
    _record(value, ("taskId", "schemaVersion", "planet", "selectedTracks", "publicMoments"), "composition request")
    task_id = _string(value["taskId"], "taskId", 120)
    _schema_version(value["schemaVersion"])

    planet = _record(value["planet"], ("id", "displayName", "tagline", "visibility"), "planet")
    clean_planet = {
        "id": _string(planet["id"], "planet id", 120),
        "displayName": _string(planet["displayName"], "planet name", 80),
        "tagline": _string(planet["tagline"], "planet tagline", 160, allow_empty=True),
        "visibility": planet["visibility"],
    }
    if clean_planet["visibility"] not in ("public", "private"):
        _fail("invalid planet visibility")

    tracks = value["selectedTracks"]
    if not isinstance(tracks, list) or not 1 <= len(tracks) <= 5:
        _fail("invalid selected tracks")
    clean_tracks = []
    track_ids = set()
    positions = set()
    primary_count = 0
    for raw in tracks:
        track = _record(raw, (
            "id", "title", "artistName", "versionLabel", "genres", "moodTags", "position", "isPrimary",
        ), "selected track")
        track_id = _string(track["id"], "track id", 120)
        if track_id in track_ids:
            _fail("duplicate track id")
        track_ids.add(track_id)
        position = track["position"]
        if isinstance(position, bool) or not isinstance(position, int) or not 0 <= position <= 4 or position in positions:
            _fail("invalid track position")
        positions.add(position)
        if not isinstance(track["isPrimary"], bool):
            _fail("invalid primary track flag")
        primary_count += int(track["isPrimary"])
        clean_tracks.append({
            "id": track_id,
            "title": _string(track["title"], "track title", 200),
            "artistName": _string(track["artistName"], "artist name", 160),
            "versionLabel": _string(track["versionLabel"], "track version", 120, allow_empty=True),
            "genres": _string_list(track["genres"], "genres"),
            "moodTags": _string_list(track["moodTags"], "mood tags"),
            "position": position,
            "isPrimary": track["isPrimary"],
        })
    if primary_count != 1:
        _fail("exactly one primary track is required")

    moments = value["publicMoments"]
    if not isinstance(moments, list) or len(moments) > 20:
        _fail("invalid public Moments")
    clean_moments = []
    moment_ids = set()
    for raw in moments:
        moment = _record(raw, ("id", "trackId", "contentText", "createdAt"), "public Moment")
        moment_id = _string(moment["id"], "Moment id", 120)
        if moment_id in moment_ids:
            _fail("duplicate Moment id")
        moment_ids.add(moment_id)
        clean_moments.append({
            "id": moment_id,
            "trackId": _string(moment["trackId"], "Moment track id", 120),
            "contentText": _string(moment["contentText"], "Moment text", 500),
            "createdAt": _string(moment["createdAt"], "Moment timestamp", 64),
        })

    return {
        "taskId": task_id,
        "schemaVersion": 1,
        "planet": clean_planet,
        "selectedTracks": clean_tracks,
        "publicMoments": clean_moments,
    }


_MATCH_REASONS = {
    "active_selection": "shared_song_selection",
    "public_moment": "shared_public_moment",
    "active_selection_and_public_moment": "shared_selection_and_moment",
}


def validate_rank_request(value):
    value = _request_object(value)
    _record(value, ("taskId", "schemaVersion", "track", "candidates"), "ranking request")
    task_id = _string(value["taskId"], "taskId", 120)
    _schema_version(value["schemaVersion"])

    track = _record(value["track"], ("id", "title", "artistName", "versionLabel", "genres", "moodTags"), "track")
    clean_track = {
        "id": _string(track["id"], "track id", 120),
        "title": _string(track["title"], "track title", 200),
        "artistName": _string(track["artistName"], "artist name", 160),
        "versionLabel": _string(track["versionLabel"], "track version", 120, allow_empty=True),
        "genres": _string_list(track["genres"], "genres"),
        "moodTags": _string_list(track["moodTags"], "mood tags"),
    }

    candidates = value["candidates"]
    if not isinstance(candidates, list) or not 1 <= len(candidates) <= MAX_RANK_CANDIDATES:
        _fail("invalid ranking candidates")
    clean_candidates = []
    seen_ids = set()
    for raw in candidates:
        candidate = _record(raw, ("planetId", "displayName", "tagline", "matchSource", "publicMomentText"), "candidate")
        planet_id = _string(candidate["planetId"], "candidate planet id", 120)
        if planet_id in seen_ids:
            _fail("duplicate candidate id")
        seen_ids.add(planet_id)
        source = candidate["matchSource"]
        if source not in _MATCH_REASONS:
            _fail("invalid candidate match source")
        moment_text = candidate["publicMomentText"]
        if moment_text is not None:
            moment_text = _string(moment_text, "public Moment text", 160)
        clean_candidates.append({
            "planetId": planet_id,
            "displayName": _string(candidate["displayName"], "candidate name", 80),
            "tagline": _string(candidate["tagline"], "candidate tagline", 160, allow_empty=True),
            "matchSource": source,
            "publicMomentText": moment_text,
        })
    return {
        "taskId": task_id,
        "schemaVersion": 1,
        "track": clean_track,
        "candidates": clean_candidates,
    }


def validate_embedding_request(value):
    value = _request_object(value)
    _record(value, ("schemaVersion", "model", "inputs"), "embedding request")
    _schema_version(value["schemaVersion"])
    if value["model"] != "qwen3-embedding:0.6b":
        _fail("unsupported embedding model")
    inputs = value["inputs"]
    if not isinstance(inputs, list) or not 1 <= len(inputs) <= MAX_EMBED_INPUTS:
        _fail("invalid embedding inputs")
    clean_inputs = []
    seen_ids = set()
    for raw in inputs:
        item = _record(raw, ("id", "text"), "embedding input")
        item_id = _string(item["id"], "embedding id", 160)
        if item_id in seen_ids:
            _fail("duplicate embedding id")
        seen_ids.add(item_id)
        clean_inputs.append({
            "id": item_id,
            "text": _string(item["text"], "embedding text", MAX_EMBED_TEXT_CHARS),
        })
    return {"schemaVersion": 1, "model": "qwen3-embedding:0.6b", "inputs": clean_inputs}


def validate_model_metadata(name, version):
    return {
        "name": _string(name, "model name", 80),
        "version": _string(version, "model version", 80),
    }


def validate_composition_output(value):
    output = _record(value, (
        "schemaVersion", "summary", "palette", "atmosphere", "motion", "particleDensity", "terrainFeatures",
    ), "planet visual output")
    if isinstance(output["schemaVersion"], bool) or output["schemaVersion"] != 2:
        _fail("unsupported visual schema version")
    summary = _string(output["summary"], "visual summary", 120)
    palette = _record(output["palette"], ("surface", "ocean", "accent"), "palette")
    colors = {}
    for key in ("surface", "ocean", "accent"):
        color = _string(palette[key], "palette color", 7)
        if not _HEX_COLOR.fullmatch(color):
            _fail("invalid palette color")
        colors[key] = color.lower()
    atmosphere = output["atmosphere"]
    if atmosphere not in ("clear", "mist", "nebula", "starlit"):
        _fail("invalid atmosphere")
    motion = output["motion"]
    if motion not in ("still", "drift", "flow", "pulse"):
        _fail("invalid motion")
    density = output["particleDensity"]
    if isinstance(density, bool) or not isinstance(density, (int, float)) or not math.isfinite(density) or not 0 <= density <= 1:
        _fail("invalid particle density")
    terrain = _record(output["terrainFeatures"], (
        "mountainRanges", "basins", "canyons", "escarpments",
    ), "terrain features")
    limits = {"mountainRanges": 6, "basins": 4, "canyons": 5, "escarpments": 4}
    clean_terrain = {}
    for key, maximum in limits.items():
        count = terrain[key]
        if isinstance(count, bool) or not isinstance(count, int) or not 0 <= count <= maximum:
            _fail("invalid terrain feature count")
        clean_terrain[key] = count
    return {
        "schemaVersion": 2,
        "summary": summary,
        "palette": colors,
        "atmosphere": atmosphere,
        "motion": motion,
        "particleDensity": float(density),
        "terrainFeatures": clean_terrain,
    }


def validate_ranking_output(value, candidates):
    output = _record(value, ("ranking",), "ranking output")
    raw_ranking = output["ranking"]
    if not isinstance(raw_ranking, list) or len(raw_ranking) != len(candidates):
        _fail("ranking must include every eligible candidate")
    candidate_sources = {item["planetId"]: item["matchSource"] for item in candidates}
    seen = set()
    ranking = []
    for item in raw_ranking:
        item = _record(item, ("planetId", "score"), "ranked candidate")
        planet_id = _string(item["planetId"], "ranked planet id", 120)
        source = candidate_sources.get(planet_id)
        if source is None or planet_id in seen:
            _fail("ranking contains an unknown or duplicate candidate")
        score = item["score"]
        if isinstance(score, bool) or not isinstance(score, (int, float)) or not math.isfinite(score) or not 0 <= score <= 1:
            _fail("invalid ranking score")
        seen.add(planet_id)
        ranking.append({"planetId": planet_id, "score": float(score), "reasonCode": _MATCH_REASONS[source]})
    if seen != set(candidate_sources):
        _fail("ranking omitted an eligible candidate")
    return sorted(ranking, key=lambda item: item["score"], reverse=True)


def validate_embedding_vectors(model_name, model_version, vectors, inputs):
    model = validate_model_metadata(model_name, model_version)
    if not isinstance(vectors, (list, tuple)) or len(vectors) != len(inputs):
        _fail("embedding output count does not match input")
    dimension = None
    embeddings = []
    for source, raw_vector in zip(inputs, vectors):
        if not isinstance(raw_vector, (list, tuple)) or not 8 <= len(raw_vector) <= 4096:
            _fail("invalid embedding dimensions")
        vector = []
        for item in raw_vector:
            if isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(item):
                _fail("invalid embedding value")
            vector.append(float(item))
        if dimension is None:
            dimension = len(vector)
        elif len(vector) != dimension:
            _fail("embedding dimensions differ")
        if not any(item != 0.0 for item in vector):
            _fail("zero embedding")
        embeddings.append({"id": source["id"], "vector": vector})
    return {"model": model, "embeddings": embeddings}
