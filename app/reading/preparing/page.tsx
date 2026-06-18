const response = await fetch("/api/readings", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    topic: intake.topic,
    question: intake.question,
    timeframeType: intake.timeframeType,
    timeframeValue: intake.timeframeValue,
    birthDate: chart.birthDate,
    birthTime: chart.birthTime,
    birthPlace: chart.birthPlace,
    tropical: chart.chartData.tropical,
    sidereal: chart.chartData.sidereal,
    transits: chart.chartData.transits,
    profection: chart.chartData.profection,
    // New timing layers — passed through if available
    progressions: chart.chartData.progressions,
    solarArcs: chart.chartData.solarArcs,
    upcomingTrigger: chart.chartData.upcomingTrigger,
    planetaryStations: chart.chartData.planetaryStations,
  }),
});