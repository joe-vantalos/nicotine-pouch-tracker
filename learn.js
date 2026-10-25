// ---- Learn: what nicotine does ---------------------------------------------
// The words on the Learn screen. Each topic has a line tied to your own data
// (`yours`, given the render context) where the evidence allows, the points, and
// their sources. Evidence: workspace shared/research/ (private). Wording rules:
// plain, sourced, information not medical advice; no lethal dose, no performance
// benefit, no personal long-term risk.

const LEARN = [
  {
    id: 'level', title: 'What your number means',
    yours: c => 'Now about ' + fmtNg(levelNow(projected(c), c.now, 'mid')) + ' ng/mL: ' + levelBand(levelNow(projected(c), c.now, 'mid')).name.toLowerCase() + '.',
    points: [
      'ng/mL is nanograms of nicotine in each millilitre of blood, measured in the arm.',
      'People using nicotine gum or an inhaler sit at about 5 to 15 ng/mL through the day. Daily smokers sit at about 10 to 50.',
      'One cigarette raises the level by about 5 to 30 ng/mL.',
      'One ZYN 6 mg pouch held for 30 minutes measured about 15 to 18 ng/mL in two US studies.',
      'Swedish snus users peaked at about 29 ng/mL over a full day of use.',
      'These are comparisons, not safe or unsafe lines.'
    ],
    src: 'Benowitz, Hukkanen & Jacob 2009; Keller-Hamilton 2024, 2025; Lunell & Lunell 2005'
  },
  {
    id: 'heart', title: 'Heart and blood pressure',
    yours: c => {
      const first = c.todayStats.list[0];
      return first ? 'Your first pouch today went in at ' + fmtTime(first.inTs) + '. That is the one that raises your heart rate most.' : null;
    },
    points: [
      'Heart rate rises by about 5 to 15 beats a minute within 5 minutes of the first pouch of the day.',
      'Blood pressure rises by about 5 to 10 mmHg, and adrenaline by about half in one snuff study.',
      'The rise lasts while your level is up, often past the time the pouch is out.',
      'Later pouches usually raise heart rate less. The sensitivity largely returns overnight.',
      'Over years, Swedish snus users were about 1.4 times as likely to develop high blood pressure. No long-term studies of pouches exist yet.'
    ],
    src: 'Wolk 2005; Antoniewicz 2018; Mallock-Ohnesorg 2024; Benowitz 2010; Hergens 2008'
  },
  {
    id: 'brain', title: 'Brain and receptors',
    yours: c => {
      const ng = levelNow(projected(c), c.now, 'mid');
      return ng < 0.5 ? null : 'At about ' + fmtNg(ng) + ' ng/mL, roughly ' + Math.round(receptorShare(ng) * 100) + '% of your main nicotine receptors are filled (an estimate).';
    },
    points: [
      'Nicotine works on nicotinic receptors in the brain, which release dopamine and other signals.',
      'They fill at very low levels: half are filled at under 1 ng/mL, in a study of smokers. One pouch fills most of them.',
      'With regular use the brain grows more of these receptors. That is part of why going without feels bad.',
      'Overnight the receptors recover, so the first pouch of the day has the strongest effect.',
      'Nicotine gives a small real lift to attention, seen even in non-users. For a regular user, much of what feels like focus or calm is relief of withdrawal from the last pouch wearing off.',
      'After stopping, receptor numbers are still raised for the first weeks and return to normal somewhere between 3 and 12 weeks.'
    ],
    src: 'Brody 2006; Heishman 2010; Parrott 1996; Mamede 2007; Cosgrove 2009'
  },
  {
    id: 'withdrawal', title: 'Withdrawal and mood',
    yours: c => c.todayStats.gaps.length ? 'Your longest gap today: ' + fmtMin(Math.max(...c.todayStats.gaps)) + '.' : null,
    points: [
      'Withdrawal can show within 30 minutes to 3 hours of the last dose, in smokers. Pouch levels fall more slowly, so it may come later.',
      'The common symptoms: irritability or anger, anxiety, low mood, poor focus, impatience, restlessness, poor sleep, hunger and cravings.',
      'After stopping, they are usually worst in week 1 and ease over 2 to 4 weeks.',
      'Mood often dips in the first weeks, then is usually better than before stopping.',
      'Cutting down to a set quit date worked about as well as stopping at once across 22 trials.',
      'Low mood that does not lift is worth taking to a GP.'
    ],
    src: 'Hendricks 2006; Hughes 2007; Klemperer 2021; Taylor 2014; Lindson 2019'
  },
  {
    id: 'sleep', title: 'Sleep',
    yours: c => {
      const bed = bedtimeTs(c), last = [...c.todayStats.list].reverse().find(e => e.outTs);
      const ng = levelSeries(projected(c), bed - 10 * MIN, bed, c.now, settings).at(-1)[1];
      return 'Your bedtime is ' + settings.bedTime + '. If you take no more today, your estimate then is about ' + fmtNg(ng) + ' ng/mL.' +
        (last && last.outTs > bed - 4 * HOUR ? ' Your last pouch came out within 4 hours of it.' : '');
    },
    points: [
      'Nicotine within 4 hours of bed was linked to more waking in the night, in a study of smokers. Total sleep time did not change.',
      'Sleep is often more broken for the first few nights after stopping.'
    ],
    src: 'Spadola 2019; Wetter 1995'
  },
  {
    id: 'exercise', title: 'Exercise and sport',
    points: [
      'Studies do not show a reliable performance benefit from nicotine, in endurance, sprint or strength work. None tested pouches.',
      'Nicotine gum raised resting heart rate by about 6 to 8 beats a minute. Heart rate during hard exercise did not differ.',
      'Non-users who used snus during exercise often felt sick or dizzy: 5 of 12 in one study. Regular users are likely less affected.',
      'There is no smoke, but one Swedish survey linked snus to more asthma symptoms. Lung function has not been measured in pouch users.'
    ],
    src: 'Mündel 2017; Mündel 2019; Zandonai 2016; Gudnadóttir 2017'
  },
  {
    id: 'longterm', title: 'Long-term risk',
    points: [
      'No long-term health studies of nicotine pouches exist yet. The nearest evidence is Swedish snus, which also delivers nicotine through the gum without smoke.',
      'Snus users were not more likely to have a heart attack or stroke. They were more likely to die from one.',
      'They were about 1.4 times as likely to develop high blood pressure. Two studies found 1.3 to 2 times the risk of heart failure; the evidence is mixed.',
      'Risk of death rose with years of use: about 1.17 times at 5 to 9 years, 1.31 at 10 to 14, and 1.29 at 15 years and over. The studies stop at "15 years or more".',
      'Among people who had a heart attack, those who stopped snus had about half the death rate of those who carried on.',
      'These are averages for groups, mostly Swedish men who never smoked. They cannot give one person\'s risk.'
    ],
    src: 'Hansson 2012, 2014; Hergens 2007, 2008; Arefalk 2012, 2014; Byhamre 2020'
  },
  {
    id: 'mouth', title: 'Mouth and body',
    points: [
      'Snus users who switched to ZYN still had a mark where the pouch sat in 70% of cases after 6 weeks, down from 90%. Moving the pouch between spots spreads the contact.',
      'Long-term effects of pouches on the gums are not yet known. Snus, held the same way, is linked to gum recession.',
      'People who stop smoking gain about 4 to 5 kg in the first year, mostly in the first 3 months. Some lose weight. This is smoking data.',
      'Heavy snus use was linked to type 2 diabetes in one large study; others found no link.'
    ],
    src: 'Alizadehgharib 2022; Kopperud 2023; Aubin 2012; Carlsson 2017; Rasouli 2017'
  },
  {
    id: 'safety', title: 'Safety',
    points: [
      'Early signs of too much (take the pouch out): nausea, light-headedness, dizziness, headache, sweating, shakiness, a racing heart. They are common for new or returning users and happen at levels one pouch can reach.',
      'Get help, from NHS 111 or 999 if severe: repeated vomiting, confusion, fainting, a fit, trouble breathing, a slow or irregular pulse.',
      'Two pouches at once, or a new one within an hour of the last, roughly doubles the dose.',
      'Keep tins and used pouches away from children and pets.',
      'This app does not show a lethal dose. The figure is disputed, and one pouch peaks about 100 times below the lowest fatal level reported.'
    ],
    src: 'Srivastava 1991; Heishman 2000; Schep 2009; Mayer 2014; Olivas 2025'
  }
];
