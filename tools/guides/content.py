"""Words for every exercise guide. `img` = use a cropped photo-style illustration instead of a drawn figure."""
G = {}

def g(id, name, group, unit, pts, steps, tip, start, targets, img=False, note=None):
    G[id] = dict(id=id, name=name, group=group, unit=unit, pts=pts, steps=steps, tip=tip, start=start, targets=targets, img=img, note=note)

# ---- Upper body
g('shoulderPress', 'Shoulder presses', 'Upper body', 'rep', 1,
  ['Stand tall with a weight in each hand at shoulder height, palms facing forward.',
   'Press both weights straight up until your arms are nearly straight.',
   'Lower slowly back to shoulder height.'],
  'Keep your ribs down and your back from arching. If it arches, the weight is too heavy.', '10–12 reps', 'shoulders + triceps')
g('sideRaises', 'Side arm raises', 'Upper body', 'rep', 2,
  ['Stand tall with a weight in each hand by your sides.',
   'With a slight bend in your elbows, lift both arms out to the side to shoulder height.',
   'Pause, then lower slowly.'],
  'Lead with your elbows and stop at shoulder height. Light weights done slowly work best.', '8–10 reps', 'shoulders')
g('bicepCurls', 'Bicep curls', 'Upper body', 'rep', 1,
  ['Stand tall, a weight in each hand, palms facing forward.',
   'Keeping your elbows tucked into your sides, curl the weights up to your shoulders.',
   'Lower slowly all the way down.'],
  'Only your forearms should move. If your body swings, slow down or go lighter.', '10–12 reps', 'biceps')
g('rhomboidPulls', 'Rhomboid pulls', 'Upper body', 'rep', 1,
  ['Stand tall with both arms straight out in front at chest height.',
   'Pull your elbows straight back, squeezing your shoulder blades together.',
   'Hold the squeeze for a second, then reach forward again.'],
  'Keep your shoulders down, away from your ears. Use a resistance band or light weights to make it harder.', '12–15 reps', 'upper back + posture')
g('tricepDips', 'Tricep dips', 'Upper body', 'rep', 3,
  ['Sit on the edge of a sturdy chair, hands gripping the seat beside your hips. Slide your hips forward off the seat.',
   'Bend your elbows straight back and lower your hips towards the floor.',
   'Press through your palms to straighten your arms.'],
  'Keep your back close to the chair and your elbows pointing behind you, not out to the sides.', '6–10 reps', 'triceps + shoulders')
g('inclinePushUps', 'Incline push ups', 'Upper body', 'rep', 2,
  ['Place your hands on a sturdy raised surface (worktop, sofa arm or step), a little wider than your shoulders.',
   'Walk your feet back until your body is one straight line.',
   'Lower your chest to the edge, then push back up.'],
  'Squeeze your stomach and glutes so your hips do not sag. A lower surface makes it harder.', '8–12 reps', 'chest + arms + core')

# ---- Core (floor)
g('crunches', 'Crunches', 'Core', 'rep', 2,
  ['Lie on your back with knees bent and feet flat. Rest your fingertips lightly behind your head.',
   'Tighten your stomach and curl your shoulders a few inches off the floor.',
   'Pause, then lower slowly.'],
  'Lift with your stomach, not your neck. Keep a fist-sized gap between chin and chest.', '10–15 reps', 'abs')
g('heelTouches', 'Heel touches', 'Core', 'rep', 1,
  ['Lie on your back, knees bent, feet flat and hip-width apart. Lift your shoulders slightly off the floor.',
   'Reach your right hand down to touch your right heel.',
   'Come back to the middle and reach to the left heel. Each touch is one rep.'],
  'Keep your shoulders lifted the whole time and bend from the waist.', '10 each side', 'obliques')
g('legLifts', 'Leg lifts', 'Core', 'rep', 3,
  ['Lie flat on your back with legs straight and hands by your sides or under your hips.',
   'Keeping your legs together and as straight as you can, raise them until they point at the ceiling.',
   'Lower them slowly, stopping just above the floor.'],
  'Press your lower back into the floor. If it lifts, bend your knees a little or do not lower as far.', '6–10 reps', 'lower abs')
g('hipLifts', 'Hip lifts', 'Core', 'rep', 2,
  ['Lie on your back with your legs pointing straight up at the ceiling, hands by your sides.',
   'Use your lower stomach to lift your hips a few inches off the floor, feet travelling straight up.',
   'Lower your hips slowly back down.'],
  'It is a small, controlled lift. Avoid swinging your legs to get momentum.', '8–12 reps', 'lower abs')
g('russianTwists', 'Russian twists', 'Core', 'rep', 2,
  ['Sit with knees bent, lean back slightly and lift your feet (or keep heels down to make it easier).',
   'Clasp your hands and rotate your shoulders to tap the floor beside one hip.',
   'Rotate to the other side. Each tap is one rep.'],
  'Turn your whole ribcage, not just your arms. Keep your chest lifted.', '10 each side', 'obliques + abs')
g('mountainClimbers', 'Mountain climbers', 'Core', 'rep', 3,
  ['Start in a high plank: hands under shoulders, body in a straight line.',
   'Drive one knee towards your chest.',
   'Switch legs in a running motion. Each knee drive is one rep.'],
  'Keep your hips level with your shoulders and your hands planted. Slow is fine.', '10 each side', 'core + shoulders + cardio')
g('plank', 'Plank', 'Core', 'sec', 5,
  ['Rest on your forearms with elbows directly under your shoulders.',
   'Step your feet back so your body forms one straight line from head to heels.',
   'Brace your stomach, squeeze your glutes and hold. Count the seconds.'],
  'Stop when your hips start to sag or lift. A shorter plank with good form beats a longer sloppy one.', '20–30 sec', 'whole core')

# ---- Lower body
g('squats', 'Squats', 'Lower body', 'rep', 2,
  ['Stand with feet shoulder-width apart, toes turned out slightly.',
   'Push your hips back and bend your knees as if sitting into a chair, arms reaching forward for balance.',
   'Drive through your heels to stand back up.'],
  'Keep your chest up and your knees tracking over your toes.', '10–15 reps', 'thighs + glutes')
g('backwardLunges', 'Backward lunges', 'Lower body', 'rep', 3,
  ['Stand tall with hands on your hips.',
   'Take a big step back and lower until both knees are bent to about 90 degrees.',
   'Push through your front heel to return to standing. Swap legs.'],
  'Keep your body upright and your front knee above your ankle.', '8 each side', 'thighs + glutes + balance')
g('hydrants', 'Hydrants', 'Lower body', 'rep', 2,
  ['Start on all fours: hands under shoulders, knees under hips.',
   'Keeping your knee bent, lift one leg out to the side until your thigh is level with your hip.',
   'Lower with control. Finish your reps, then swap sides.'],
  'Keep your hips square to the floor and do not lean away from the lifting leg.', '10 each side', 'outer hips + glutes')
g('donkeyKicks', 'Donkey kicks', 'Lower body', 'rep', 1,
  ['Start on all fours: hands under shoulders, knees under hips.',
   'Keeping your knee bent, lift one leg behind you until the sole of your foot faces the ceiling.',
   'Lower with control. Finish your reps, then swap sides.'],
  'Squeeze your glute at the top and keep your back flat, not arched.', '12 each side', 'glutes')
g('lyingLegRaises', 'Lying leg raises', 'Lower body', 'rep', 2,
  ['Lie on your side with your legs straight and stacked, head resting on your lower arm.',
   'Lift your top leg as high as is comfortable, keeping it straight with toes pointing forward.',
   'Lower slowly. Finish your reps, then roll over and swap sides.'],
  'Keep your hips stacked. Do not roll backwards as the leg lifts.', '10 each side', 'outer hips + glutes')
g('calfRaises', 'Calf raises', 'Lower body', 'rep', 1,
  ['Stand tall with feet hip-width apart. Hold a wall or chair for balance if you need it.',
   'Rise up onto the balls of your feet as high as you can.',
   'Pause, then lower your heels slowly.'],
  'Go straight up and down without rocking forward. Slow lowering does most of the work.', '15–20 reps', 'calves')
g('sumoCalfRaises', 'Sumo squat calf raises', 'Lower body', 'rep', 2,
  ['Stand with feet wide and toes turned out. Sink into a wide squat with hands on your hips.',
   'Staying low in the squat, lift both heels off the floor.',
   'Lower your heels and repeat without standing up.'],
  'Keep your knees pushed out over your toes and your back upright.', '10–12 reps', 'calves + inner thighs + glutes')

# ---- Standing core (from Simon's sheets)
g('kneeToElbow', 'Standing knee-to-elbow crunch', 'Standing core', 'rep', 1,
  ['Stand tall with your hands lightly behind your head.',
   'Raise one knee while bringing the opposite elbow towards it.',
   'Tighten your stomach as they meet, then return and swap sides.'],
  'Move slowly for control and keep breathing normally.', '10 each side', 'abs + obliques', img=True)
g('standingSideCrunch', 'Standing side crunch', 'Standing core', 'rep', 1,
  ['Stand tall with your hands behind your head.',
   'Lift one knee out to the side while lowering the same-side elbow towards it.',
   'Return to standing and repeat on the other side.'],
  'Bend sideways at the waist rather than leaning forward.', '10 each side', 'obliques', img=True)
g('slowMarches', 'Slow standing marches', 'Standing core', 'rep', 1,
  ['Stand tall and brace your abdomen.',
   'Raise one knee to hip height and hold for 2–3 seconds.',
   'Lower and change legs without leaning back.'],
  'The hold is what makes it work. Stay tall through the standing leg.', '10 each side', 'deep core + balance', img=True)
g('crossBodyKneeDrive', 'Standing cross-body knee drive', 'Standing core', 'rep', 1,
  ['Reach both hands above one shoulder.',
   'Bring them diagonally down towards the opposite rising knee.',
   'Control the return, finish your reps, then swap sides.'],
  'Rotate through your ribcage and keep the standing leg soft, not locked.', '10 each side', 'obliques + rotational core', img=True)
g('torsoRotations', 'Standing torso rotations', 'Standing core', 'rep', 1,
  ['Stand with feet shoulder-width apart and arms crossed over your chest.',
   'Brace your stomach and slowly rotate your ribcage to the left.',
   'Rotate to the right, keeping your hips mostly forward.'],
  'Slow and controlled. Each turn to one side is a rep.', '10–15 each side', 'rotational core', img=True)
g('lateralBends', 'Standing lateral bends', 'Standing core', 'rep', 1,
  ['Stand tall with arms by your sides.',
   'Slide one hand down the outside of your thigh.',
   'Return to centre, then change sides.'],
  'Move slowly and avoid bouncing. Bend directly sideways, not forwards.', '10 each side', 'obliques', img=True)
g('singleLegBalance', 'Single-leg balance + brace', 'Standing core', 'sec', 1,
  ['Stand on one leg with a soft knee.',
   'Tighten your abdomen as though expecting a gentle punch.',
   'Keep your pelvis level, stay tall and hold. Count the seconds, then swap legs.'],
  'Fix your eyes on one spot to steady yourself.', '20–30 sec each leg', 'deep core + hip stabilisers', img=True)
g('abdominalBrace', 'Standing abdominal brace', 'Standing core', 'sec', 1,
  ['Stand tall with hands on your hips.',
   'Gently tense your entire midsection without sucking your stomach in.',
   'Imagine tightening a corset around your waist. Hold and breathe normally.'],
  'Count the seconds. You should be able to talk while holding it.', '20–30 sec', 'transverse / deep core', img=True)
